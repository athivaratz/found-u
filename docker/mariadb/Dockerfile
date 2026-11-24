FROM mariadb:10.11.19

# Docker Hub has no mariadb:10.11.20 tag (registry 404 on 2026-11-23).
# The 10.11.19 image pins its apt repo to that patch. Point apt at the
# 10.11.20 archive and upgrade. 10.6 is past its security window and is not used.
# SQL in this project stays valid on 10.11 and 11.x.
USER root
RUN printf 'deb http://archive.mariadb.org/mariadb-10.11.20/repo/ubuntu jammy main\n' > /etc/apt/sources.list.d/mariadb.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends mariadb-server mariadb-client \
    && rm -rf /var/lib/apt/lists/* \
    && ver="$(mariadbd --version | sed -n 's/.*Ver \([0-9][0-9.]*\).*/\1/p')" \
    && echo "mariadb ${ver}" \
    && dpkg --compare-versions "${ver}" ge 10.11.20
# apt install seeds /var/lib/mysql. Docker would copy that into a new volume
# and the entrypoint would skip creating MARIADB_USER. Leave the datadir empty.
RUN rm -rf /var/lib/mysql \
    && mkdir -p /var/lib/mysql /run/mysqld \
    && chown -R mysql:mysql /var/lib/mysql /run/mysqld
