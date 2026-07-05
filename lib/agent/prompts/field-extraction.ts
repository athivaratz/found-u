import {
  buildNerExamplesSection,
  buildNerSchemaSection,
  NER_NO_INVENT_RULE,
} from "@/lib/agent/ner-field-hints";

export const FIELD_EXTRACTION_SECTION = `${buildNerSchemaSection()}

${NER_NO_INVENT_RULE}

${buildNerExamplesSection()}`;
