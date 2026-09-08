FROM alpine:3.24.1@sha256:79ff19e9084a00eece421b2523fb93e22d730e2c0e525905de047e848e56d95f AS base

FROM base AS verify-inputs
RUN --network=none --mount=type=bind,source=inputs/apk,target=/inputs,readonly \
    cd /inputs/build \
    && sha256sum -c SHA256SUMS \
    && apk verify ./*.apk \
    && cd /inputs/runtime \
    && sha256sum -c SHA256SUMS \
    && apk verify ./*.apk

FROM verify-inputs AS build-os

# The orchestrator materializes this minimal context from inputs.lock.json.
# No package index, install script download, or mutable repository is consulted.
RUN --network=none --mount=type=bind,source=inputs/apk/build,target=/inputs,readonly \
    cd /inputs \
    && sha256sum -c SHA256SUMS \
    && apk add --no-network --upgrade ./*.apk

FROM build-os AS build
WORKDIR /work
ENV SOURCE_DATE_EPOCH=1786396078
RUN --network=none --mount=type=bind,source=inputs/source,target=/inputs/source,readonly \
    printf '%s  %s\n' \
      dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979 \
      /inputs/source/postgresql-17.11.tar.bz2 | sha256sum -c - \
    && tar -xjf /inputs/source/postgresql-17.11.tar.bz2 \
    && cd postgresql-17.11 \
    && ./configure --prefix=/opt/postgresql --with-ssl=openssl \
         --without-readline --with-system-tzdata=/usr/share/zoneinfo \
    && make -j2 \
    && make install-strip \
    && install -Dm644 COPYRIGHT /opt/postgresql/share/COPYRIGHT

FROM build-os AS runtime-root
# A new root has no inherited package history or build tools. Keep the package
# database for independent scanner extraction; package scripts are not run.
RUN --network=none --mount=type=bind,source=inputs/apk/runtime,target=/inputs,readonly \
    cd /inputs \
    && sha256sum -c SHA256SUMS \
    && apk --root /runtime --initdb --keys-dir /etc/apk/keys \
         add --no-network --no-scripts ./*.apk \
    && mkdir -p /runtime/bin /runtime/etc /runtime/run/postgresql \
         /runtime/var/lib/postgresql/data /runtime/tmp \
    && for applet in awk cat chmod cp find id mkdir mktemp mv rm rmdir sha256sum wc; do \
         ln -sf /bin/busybox "/runtime/bin/$applet"; \
       done \
    && printf 'root:x:0:0:root:/root:/sbin/nologin\npostgres:x:70:70:PostgreSQL:/var/lib/postgresql:/sbin/nologin\n' > /runtime/etc/passwd \
    && printf 'root:x:0:\npostgres:x:70:\n' > /runtime/etc/group \
    && printf 'ID=alpine\nNAME="Alpine Linux"\nVERSION_ID=3.24.1\n' > /runtime/etc/os-release \
    && chown 70:70 /runtime/run/postgresql /runtime/var/lib/postgresql /runtime/var/lib/postgresql/data \
    && chmod 0700 /runtime/run/postgresql /runtime/var/lib/postgresql/data \
    && chmod 1777 /runtime/tmp
COPY --from=build /opt/postgresql /runtime/opt/postgresql

FROM scratch AS runtime
COPY --from=runtime-root /runtime /
COPY --chmod=0555 entrypoint.sh /usr/local/bin/hedefora-postgres
ENV PATH=/opt/postgresql/bin:/bin
ENV PGDATA=/var/lib/postgresql/data
ENV LANG=C.UTF-8
ENV TZ=UTC
USER 70:70
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/hedefora-postgres"]
CMD ["postgres"]
