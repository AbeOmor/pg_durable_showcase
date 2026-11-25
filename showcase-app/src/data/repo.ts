export const REPO_URL = 'https://github.com/AbeOmor/pg_durable_showcase';

export const sourceUrl = (path: string) => `${REPO_URL}/blob/main/${path}`;
export const folderUrl = (path: string) => `${REPO_URL}/tree/main/${path}`;

// "02-custom-endpoint-aca-http/demo_walkthrough.sql" -> "02/demo_walkthrough.sql"
export const shortPath = (path: string) => path.replace(/^(\d\d)-[^/]+\//, '$1/');

export const SOURCES = {
  applet1: {
    folder: '01-ai-tune-sql',
    walkthrough: '01-ai-tune-sql/demo_walkthrough.sql',
    applet: '01-ai-tune-sql/ai_tune_applet.sql',
  },
  applet2: {
    folder: '02-custom-endpoint-aca-http',
    walkthrough: '02-custom-endpoint-aca-http/demo_walkthrough.sql',
    applet: '02-custom-endpoint-aca-http/custom_endpoint_http_applet.sql',
  },
  applet3Pipelines: {
    folder: '03-internal-use-case',
    walkthrough: '03-internal-use-case/demo_walkthrough_ai_pipelines.sql',
    applet: '03-internal-use-case/ai_pipelines_kg_applet.sql',
  },
  applet3Durable: {
    folder: '03-internal-use-case',
    walkthrough: '03-internal-use-case/demo_walkthrough.sql',
    applet: '03-internal-use-case/internal_applet.sql',
  },
} as const;
