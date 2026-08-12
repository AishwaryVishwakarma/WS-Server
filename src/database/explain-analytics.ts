import dataSource from './data-source';

async function main() {
  await dataSource.initialize();
  const rows = await dataSource.query<Array<{'QUERY PLAN': string}>>(
    `EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM analytics_event WHERE type = 'story_viewed' AND "createdAt" >= now() - interval '30 days'`
  );
  console.log(rows.map((row) => row['QUERY PLAN']).join('\n'));
  await dataSource.destroy();
}

void main();
