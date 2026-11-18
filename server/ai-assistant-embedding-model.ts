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

async function ensureAsset(directory: string, [name, expectedHash, bytes]: typeof assets[number], signal: AbortSignal) {
  const path = join(directory, name);
  try {
    const existingHash = createHash('sha256');
    for await (const chunk of createReadStream(path, { signal })) existingHash.update(chunk);
    if (existingHash.digest('hex') === expectedHash) return path;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

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
      else { hash.update(chunk); callback(null, chunk); }
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

export async function loadAssistantEmbeddingModel(directory: string, signal: AbortSignal) {
  await mkdir(join(directory, 'onnx'), { recursive: true });
  const download = new AbortController();
  const downloadSignal = AbortSignal.any([signal, download.signal]);
  const results = await Promise.allSettled(assets.map(asset => ensureAsset(directory, asset, downloadSignal).catch(error => {
    download.abort(error);
    throw error;
  })));
  downloadSignal.throwIfAborted();
  const [tokenizerPath, configPath, modelPath] = results.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
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
