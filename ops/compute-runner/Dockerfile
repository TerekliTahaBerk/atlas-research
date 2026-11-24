FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS compiler
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev linux-libc-dev libseccomp-dev && rm -rf /var/lib/apt/lists/*
COPY isolate.c /build/isolate.c
RUN gcc -std=c17 -Wall -Wextra -Werror -O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -Wl,-z,relro,-z,now -o /build/isolate /build/isolate.c -lseccomp

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update && apt-get install -y --no-install-recommends python3 libseccomp2 texlive-latex-base && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/atlas-compute
COPY --from=compiler /build/isolate ./isolate
COPY server.mjs ./server.mjs
RUN { dpkg-query -W | LC_ALL=C sort; sha256sum ./isolate ./server.mjs; } | sha256sum | cut -d' ' -f1 > image.fingerprint
ARG ATLAS_SOURCE_COMMIT=local
LABEL org.opencontainers.image.revision=$ATLAS_SOURCE_COMMIT
ENV NODE_ENV=production ATLAS_COMPUTE_RUNNER_VERSION=$ATLAS_SOURCE_COMMIT
USER node
EXPOSE 8090
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s CMD ["node","server.mjs","--health"]
CMD ["node","server.mjs"]
