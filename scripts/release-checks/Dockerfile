FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg xvfb xauth x11-utils xdotool python3 dbus-x11 libgtk-3-0 libnss3 libasound2t64 && rm -rf /var/lib/apt/lists/*
COPY scripts/release-checks /checks
ENTRYPOINT ["bash", "/checks/install-check.sh"]
