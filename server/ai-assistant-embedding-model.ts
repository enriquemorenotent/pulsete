import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Tokenizer } from '@huggingface/tokenizers';
import { InferenceSession, Tensor } from 'onnxruntime-node';

import { embeddingSize, embeddingModelRevision } from './ai-assistant-embedding-version.js';

const assets = [
  ['tokenizer.json', '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39', 17_082_730],
  ['tokenizer_config.json', 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b', 443],
  ['onnx/model_int8.onnx', '4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c', 118_054_593],
] as const;

async function hasAsset(path: string, expectedHash: string, signal: AbortSignal) {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
    return hash.digest('hex') === expectedHash;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}

export type ModelDownloadProgress = { receivedBytes: number; totalBytes: number };

async function downloadAsset(directory: string, [name, expectedHash, bytes]: typeof assets[number],
  signal: AbortSignal, onBytes: (length: number) => void) {
  const path = join(directory, name);
  const response = await fetch(`https://huggingface.co/Xenova/multilingual-e5-small/resolve/${embeddingModelRevision}/${name}?download=true`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
  if (!response.ok || !response.body) throw new Error(`Embedding asset download failed (${response.status})`);

  const temporary = path + '.' + randomUUID() + '.part';
  const hash = createHash('sha256');
  let received = 0;
  const check = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > bytes) callback(new Error('Embedding asset exceeded expected size'));
      else { hash.update(chunk); onBytes(chunk.length); callback(null, chunk); }
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), check, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
    if (received !== bytes || hash.digest('hex') !== expectedHash) throw new Error('Embedding asset checksum mismatch');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}

export async function loadAssistantEmbeddingModel(directory: string, signal: AbortSignal,
  onDownload: (progress: ModelDownloadProgress | null) => void) {
  await mkdir(join(directory, 'onnx'), { recursive: true });
  const paths = assets.map(([name]) => join(directory, name));
  const cached = await Promise.all(assets.map(([, hash], i) => hasAsset(paths[i], hash, signal)));
  const missing = assets.filter((_, i) => !cached[i]);
  if (missing.length) {
    const download = new AbortController();
    const downloadSignal = AbortSignal.any([signal, download.signal]);
    const totalBytes = missing.reduce((total, [, , size]) => total + size, 0);
    let receivedBytes = 0;
    let lastUpdate = Date.now();
    onDownload({ receivedBytes, totalBytes });
    const onBytes = (length: number) => {
      receivedBytes += length;
      const now = Date.now();
      if (now - lastUpdate >= 150 || receivedBytes === totalBytes) {
        onDownload({ receivedBytes, totalBytes });
        lastUpdate = now;
      }
    };
    await Promise.allSettled(missing.map(asset => downloadAsset(directory, asset, downloadSignal, onBytes).catch(error => {
      download.abort(error);
      throw error;
    })));
    downloadSignal.throwIfAborted();
    onDownload(null);
  }
  const [tokenizerPath, configPath, modelPath] = paths;
  const tokenizer = new Tokenizer(JSON.parse(await readFile(tokenizerPath, 'utf8')), JSON.parse(await readFile(configPath, 'utf8')));
  const session = await InferenceSession.create(modelPath, {
    executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1,
  });
  const pad = BigInt(tokenizer.token_to_id('<pad>') ?? 1);
  return async (texts: readonly string[]) => {
    const tokens = texts.map(text => {
      const { ids } = tokenizer.encode(text, { add_special_tokens: true });
      return ids.length <= 512 ? ids : [...ids.slice(0, 511), ids.at(-1)!];
    });
    const width = Math.max(...tokens.map(row => row.length));
    const shape = [tokens.length, width];
    const ids = new BigInt64Array(tokens.length * width).fill(pad);
    const masks = new BigInt64Array(ids.length);
    tokens.forEach((row, i) => {
      ids.set(row.map(BigInt), i * width);
      masks.fill(1n, i * width, i * width + row.length);
    });
    const inputs: Record<string, Tensor> = {
      input_ids: new Tensor('int64', ids, shape),
      attention_mask: new Tensor('int64', masks, shape),
    };
    if (session.inputNames.includes('token_type_ids')) {
      inputs.token_type_ids = new Tensor('int64', new BigInt64Array(ids.length), shape);
    }
    const output = await session.run(inputs);
    const tensor = output.last_hidden_state;
    try {
      const values = tensor.data as Float32Array;
      return tokens.map((row, number) => {
        const embedding = new Float32Array(embeddingSize);
        for (let token = 0; token < row.length; token++) {
          const offset = (number * width + token) * embeddingSize;
          for (let i = 0; i < embeddingSize; i++) embedding[i] += values[offset + i];
        }
        const norm = Math.hypot(...embedding);
        return embedding.map(value => value / norm);
      });
    } finally {
      for (const value of Object.values(output)) value.dispose();
    }
  };
}
