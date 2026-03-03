export const STORAGE_KEYS = {
  schemaVersion: 'speedread_schema_version',
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
  sessionSnapshot: 'speedread_session_snapshot',
  drillState: 'speedread_drill_state',
  trainingSentenceMode: 'speedread_training_sentence',
  trainingScoreDetails: 'speedread_training_score_details',
  trainingScaffold: 'speedread_training_scaffold',
  dailyDate: 'speedread_daily_date',
  dailyArticleId: 'speedread_daily_article_id',
  comprehensionAttempts: 'speedread_comprehension_attempts',
  comprehensionApiKey: 'speedread_comprehension_api_key',
} as const;

export const CURRENT_STORAGE_SCHEMA_VERSION = 4;
