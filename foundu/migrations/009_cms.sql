-- Help pages and articles. Public reads of articles are status = published.
-- Drafts are admin-only. Help rows are readable, including audience = admin,
-- which matches the old policy. Tag search is JSON_CONTAINS. The table is
-- small, so there is no extra tag index. MariaDB has no GIN.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS help_pages (
  slug VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  intro TEXT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS help_sections (
  id CHAR(36) NOT NULL,
  page_slug VARCHAR(128) NOT NULL,
  section_type ENUM('step', 'note', 'faq') NOT NULL DEFAULT 'step',
  audience ENUM('all', 'student', 'admin') NOT NULL DEFAULT 'all',
  title VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  image_url VARCHAR(2048) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_help_sections_page_sort (page_slug, sort_order),
  KEY idx_help_sections_updated (updated_at),
  CONSTRAINT fk_help_sections_page FOREIGN KEY (page_slug) REFERENCES help_pages (slug) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id CHAR(36) NOT NULL,
  slug VARCHAR(191) NOT NULL,
  section ENUM('blog', 'help') NOT NULL DEFAULT 'blog',
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NULL,
  cover_image_url VARCHAR(2048) NULL,
  author_name VARCHAR(255) NULL,
  tags JSON NOT NULL DEFAULT ('[]'),
  content_json JSON NOT NULL DEFAULT ('{"type":"doc","content":[]}'),
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_articles_slug (slug),
  KEY idx_articles_section_status_published (section, status, published_at),
  KEY idx_articles_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
