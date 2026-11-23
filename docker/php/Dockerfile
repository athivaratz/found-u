FROM php:8.2.36-apache

# Apache in this tag is 2.4.71. Fail the build if a later rebuild is older.
RUN ver="$(apache2 -v | sed -n 's/.*Apache\/\([0-9.]*\).*/\1/p')" \
    && echo "apache ${ver}" \
    && dpkg --compare-versions "${ver}" ge 2.4.71 \
    && php -r 'exit(PHP_VERSION_ID >= 80236 ? 0 : 1);'

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        libfreetype6-dev \
        libicu-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libzip-dev \
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j2 gd intl pdo_mysql zip \
    && pecl install apcu \
    && docker-php-ext-enable apcu \
    && a2enmod rewrite headers setenvif \
    && printf '%s\n' 'ServerTokens Prod' 'ServerSignature Off' 'TraceEnable Off' > /etc/apache2/conf-available/zz-foundu-hardening.conf \
    && a2enconf zz-foundu-hardening \
    && rm -rf /var/lib/apt/lists/* /tmp/pear

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY php.ini /usr/local/etc/php/conf.d/zz-foundu.ini
COPY vhost.conf /etc/apache2/sites-available/000-default.conf
COPY entrypoint.sh /usr/local/bin/foundu-entrypoint
RUN chmod +x /usr/local/bin/foundu-entrypoint

WORKDIR /srv/site
ENTRYPOINT ["foundu-entrypoint"]
CMD ["apache2-foreground"]
