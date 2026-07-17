export const SETUP_ADVISORY_LOCK_ID = 74821401;
export const SETUP_STATUS_ID = "setup_status";
export const SCHOOL_BRANDING_ID = "school_branding";
export const AI_CREDENTIALS_ID = "ai_credentials";
export const SETUP_OK_COOKIE = "fu_setup_ok";
export const SETUP_OK_COOKIE_MAX_AGE = 60;
export const SETUP_WIZARD_STEPS_COUNT = 3;

export const SCHOOL_BRANDING_BUCKET = "school-branding";
export const ITEM_UPLOADS_BUCKET = "item-uploads";
export const HELP_ASSETS_BUCKET = "help-assets";
export const BLOG_ASSETS_BUCKET = "blog-assets";

export const SETUP_WIZARD_STEP_LABELS = [
  { id: "branding", label: "โรงเรียน" },
  { id: "ai", label: "AI" },
  { id: "admin", label: "แอดมิน" },
] as const;
