# Schema

MariaDB 10.11 and 11.x. InnoDB, `utf8mb4_unicode_ci`, times stored as UTC `DATETIME(3)`.

The numbered files are the source. `all.sql` is those files concatenated. Rebuild it with:

```bash
php foundu/bin/build-migrations-sql.php
```

`seed-admin.sql.example` is not part of that bundle. Neither is `foundu/seed/dev.sql`.

## On the host (no shell)

Import `all.sql` in phpMyAdmin. Then import a real admin insert.

There is no migrate URL. A token-protected page that runs schema SQL would be one leaked file away from letting someone else change the database, and the token would sit on the same account as the site. phpMyAdmin is already how this host edits MariaDB, and DirectAdmin is what authenticates that session. Use that.

`foundu/bin/migrate.php` is for a machine where you can run PHP: your laptop, the docker stack, or a DirectAdmin cron command if you want the tracker. It records each file in `schema_migrations` and will not run a file whose contents changed after it was applied. Importing `all.sql` by hand leaves that table empty. The next `migrate.php` run applies the files once more (they are written so a second run is a no-op) and then records them.

First admin, on your own machine:

```bash
FOUNDU_ADMIN_PASSWORD='choose-a-password' php foundu/bin/create-admin.php --student-id=11111
```

Paste the SQL it prints. Do not commit that output. `--apply` inserts directly when `DB_*` can reach the server. The password needs 8 characters, a letter, and a digit. The hash is Argon2id when PHP has it, otherwise bcrypt.

A filled-in copy of `seed-admin.sql.example` is the same idea if you would rather call `password_hash` yourself.

Starter categories and locations for a local database (and for the host, if you want the same lists) are `foundu/seed/dev.sql`. It does not create an admin.

## Local

```bash
make migrate
make seed
```

`make test` applies the schema to an empty database, applies it again, and imports `all.sql` twice.
