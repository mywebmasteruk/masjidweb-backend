#!/usr/bin/env node
/**
 * One-off YCode publish helper (bypasses Netlify function timeout).
 *
 * Usage (never commit secrets):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TENANT_ID=... node publish-collections.mjs
 *
 * Copy from Netlify admin env or admin-dashboard-v2/.env locally.
 */
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Export it in the shell (never commit secrets).`);
    process.exit(1);
  }
  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
const SB_URL = `${supabaseUrl}/rest/v1`;
const SB_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const TENANT = requireEnv('TENANT_ID');
const HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates,return=minimal',
};

async function sb(path, opts = {}) {
  const url = `${SB_URL}${path}`;
  const res = await fetch(url, { headers: HEADERS, ...opts });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${path}: ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return null;
}

async function fetchAll(table, filters) {
  const params = new URLSearchParams(filters);
  params.set('limit', '1000');
  const rows = await sb(`/${table}?${params}`);
  return rows || [];
}

async function upsertBatch(table, rows) {
  if (!rows.length) return 0;
  const BATCH = 100;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await sb(`/${table}?on_conflict=id,is_published`, {
      method: 'POST',
      body: JSON.stringify(chunk),
    });
    total += chunk.length;
  }
  return total;
}

async function publishCollection(collId, collName) {
  const now = new Date().toISOString();
  console.log(`\n--- Publishing "${collName}" (${collId}) ---`);

  // 1) Collection metadata (exclude uuid — has its own unique constraint)
  const drafts = await fetchAll('collections', {
    'id': `eq.${collId}`,
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
  });
  if (!drafts.length) { console.log('  No draft collection found, skip.'); return; }
  const d = drafts[0];
  const pubColl = {
    id: d.id,
    name: d.name,
    sorting: d.sorting,
    order: d.order,
    is_published: true,
    created_at: d.created_at,
    updated_at: now,
    tenant_id: d.tenant_id,
  };
  await upsertBatch('collections', [pubColl]);
  console.log('  Collection metadata: OK');

  // 2) Fields (explicit columns matching YCode collectionService)
  const draftFields = await fetchAll('collection_fields', {
    'collection_id': `eq.${collId}`,
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  const pubFields = draftFields.map(f => ({
    id: f.id,
    name: f.name,
    key: f.key,
    type: f.type,
    default: f.default,
    fillable: f.fillable,
    order: f.order,
    collection_id: f.collection_id,
    reference_collection_id: f.reference_collection_id,
    hidden: f.hidden,
    is_computed: f.is_computed,
    data: f.data,
    is_published: true,
    created_at: f.created_at,
    updated_at: now,
    tenant_id: f.tenant_id,
  }));
  const fc = await upsertBatch('collection_fields', pubFields);
  console.log(`  Fields: ${fc}`);

  // 3) Items (explicit columns matching YCode collectionService)
  const draftItems = await fetchAll('collection_items', {
    'collection_id': `eq.${collId}`,
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
    'is_publishable': 'eq.true',
  });
  const pubItems = draftItems.map(it => ({
    id: it.id,
    collection_id: it.collection_id,
    manual_order: it.manual_order,
    is_publishable: it.is_publishable,
    is_published: true,
    content_hash: it.content_hash,
    created_at: it.created_at,
    updated_at: now,
    tenant_id: it.tenant_id,
  }));
  const ic = await upsertBatch('collection_items', pubItems);
  console.log(`  Items: ${ic}`);

  // 4) Values for those items
  if (draftItems.length > 0) {
    const itemIds = draftItems.map(it => it.id);
    let allValues = [];
    const CHUNK = 50;
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const ids = itemIds.slice(i, i + CHUNK);
      const vals = await fetchAll('collection_item_values', {
        'item_id': `in.(${ids.join(',')})`,
        'is_published': 'eq.false',
        'tenant_id': `eq.${TENANT}`,
      });
      allValues = allValues.concat(vals);
    }
    const pubValues = allValues.map(v => ({
      id: v.id,
      item_id: v.item_id,
      field_id: v.field_id,
      value: v.value,
      is_published: true,
      created_at: v.created_at,
      updated_at: now,
      tenant_id: v.tenant_id,
    }));
    const vc = await upsertBatch('collection_item_values', pubValues);
    console.log(`  Values: ${vc}`);
  } else {
    console.log('  Values: 0 (no items)');
  }
  console.log(`  Done: "${collName}"`);
}

async function publishPages() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Pages ===');

  const draftPages = await fetchAll('pages', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (!draftPages.length) { console.log('  No draft pages.'); return; }

  const pubPages = draftPages.map(p => ({
    id: p.id,
    page_folder_id: p.page_folder_id,
    name: p.name,
    slug: p.slug,
    order: p.order,
    depth: p.depth,
    is_index: p.is_index,
    is_dynamic: p.is_dynamic,
    error_page: p.error_page,
    settings: p.settings,
    is_published: true,
    content_hash: p.content_hash,
    created_at: p.created_at,
    updated_at: now,
    tenant_id: p.tenant_id,
  }));
  const pc = await upsertBatch('pages', pubPages);
  console.log(`  Pages: ${pc}`);

  // Layers for these pages
  const pageIds = draftPages.map(p => p.id);
  let allLayers = [];
  const CHUNK = 20;
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    const ids = pageIds.slice(i, i + CHUNK);
    const layers = await fetchAll('page_layers', {
      'page_id': `in.(${ids.join(',')})`,
      'is_published': 'eq.false',
      'tenant_id': `eq.${TENANT}`,
    });
    allLayers = allLayers.concat(layers);
  }
  const pubLayers = allLayers.map(l => ({
    id: l.id,
    page_id: l.page_id,
    layers: l.layers,
    is_published: true,
    content_hash: l.content_hash,
    created_at: l.created_at,
    updated_at: now,
    tenant_id: l.tenant_id,
  }));
  const lc = await upsertBatch('page_layers', pubLayers);
  console.log(`  Layers: ${lc}`);
}

async function publishAssets() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Assets ===');

  const draftFolders = await fetchAll('asset_folders', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (draftFolders.length > 0) {
    const pubFolders = draftFolders.map(f => {
      const { deleted_at, uuid, ...rest } = f;
      return { ...rest, is_published: true, updated_at: now };
    });
    const fc = await upsertBatch('asset_folders', pubFolders);
    console.log(`  Asset folders: ${fc}`);
  }

  const draftAssets = await fetchAll('assets', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (draftAssets.length > 0) {
    const pubAssets = draftAssets.map(a => {
      const { deleted_at, uuid, ...rest } = a;
      return { ...rest, is_published: true, updated_at: now };
    });
    const ac = await upsertBatch('assets', pubAssets);
    console.log(`  Assets: ${ac}`);
  } else {
    console.log('  No unpublished assets.');
  }
}

async function publishComponents() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Components ===');

  const draftComps = await fetchAll('components', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (!draftComps.length) { console.log('  No unpublished components.'); return; }
  const pubComps = draftComps.map(c => {
    const { deleted_at, uuid, ...rest } = c;
    return { ...rest, is_published: true, updated_at: now };
  });
  const cc = await upsertBatch('components', pubComps);
  console.log(`  Components: ${cc}`);
}

async function publishLayerStyles() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Layer Styles ===');

  const draftStyles = await fetchAll('layer_styles', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (!draftStyles.length) { console.log('  No unpublished layer styles.'); return; }
  const pubStyles = draftStyles.map(s => {
    const { deleted_at, uuid, ...rest } = s;
    return { ...rest, is_published: true, updated_at: now };
  });
  const sc = await upsertBatch('layer_styles', pubStyles);
  console.log(`  Layer styles: ${sc}`);
}

async function publishCSS() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing CSS ===');

  const draftCSS = await fetchAll('settings', {
    'key': 'eq.draft_css',
    'tenant_id': `eq.${TENANT}`,
  });
  if (draftCSS.length > 0) {
    const cssValue = draftCSS[0].value;
    await sb(`/settings?key=eq.published_css&tenant_id=eq.${TENANT}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: cssValue, updated_at: now }),
    });
    console.log('  CSS copied from draft to published.');
  } else {
    console.log('  No draft CSS found.');
  }
}

async function updatePublishedAt() {
  const now = new Date().toISOString();
  console.log('\n=== Updating published_at ===');

  const existing = await fetchAll('settings', {
    'key': 'eq.published_at',
    'tenant_id': `eq.${TENANT}`,
  });

  if (existing.length > 0) {
    await sb(`/settings?key=eq.published_at&tenant_id=eq.${TENANT}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: now, updated_at: now }),
    });
  } else {
    await sb('/settings', {
      method: 'POST',
      body: JSON.stringify({ key: 'published_at', value: now, tenant_id: TENANT }),
    });
  }
  console.log(`  published_at = ${now}`);
}

async function publishFolders() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Page Folders ===');

  const draftFolders = await fetchAll('page_folders', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  if (!draftFolders.length) { console.log('  No unpublished page folders.'); return; }
  const pubFolders = draftFolders.map(f => {
    const { deleted_at, uuid, ...rest } = f;
    return { ...rest, is_published: true, updated_at: now };
  });
  const fc = await upsertBatch('page_folders', pubFolders);
  console.log(`  Page folders: ${fc}`);
}

async function publishFonts() {
  const now = new Date().toISOString();
  console.log('\n=== Publishing Fonts ===');

  const draftFonts = await fetchAll('fonts', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
  });
  if (!draftFonts.length) { console.log('  No unpublished fonts.'); return; }
  const pubFonts = draftFonts.map(f => {
    const { deleted_at, uuid, ...rest } = f;
    return { ...rest, is_published: true, updated_at: now };
  });
  const fc = await upsertBatch('fonts', pubFonts);
  console.log(`  Fonts: ${fc}`);
}

async function main() {
  console.log('=== YCode Direct Publish (bypassing Netlify function timeout) ===\n');

  // Get all draft collections
  const collections = await fetchAll('collections', {
    'is_published': 'eq.false',
    'tenant_id': `eq.${TENANT}`,
    'deleted_at': 'is.null',
  });
  console.log(`Found ${collections.length} collections to publish.`);

  // Publish folders first
  await publishFolders();

  // Publish pages and layers
  await publishPages();

  // Publish each collection one at a time
  for (const coll of collections) {
    await publishCollection(coll.id, coll.name);
  }

  // Publish other items
  await publishComponents();
  await publishLayerStyles();
  await publishAssets();
  await publishFonts();

  // Publish CSS
  await publishCSS();

  // Update published_at timestamp
  await updatePublishedAt();

  console.log('\n=== All done! ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
