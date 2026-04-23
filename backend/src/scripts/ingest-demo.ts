import { loadConfig, resetConfigCache } from "../../config";
import { parseScannedFile } from "../ingest/parse";
import { scanSourceFiles } from "../ingest/file-scanner";

async function main(): Promise<void> {
  resetConfigCache();
  const config = await loadConfig({ forceReload: true });
  const scanned = await scanSourceFiles(config);

  const items = [];
  for (const file of scanned) {
    const doc = await parseScannedFile(file);
    items.push({
      doc_id: doc.doc_id,
      doc_title: doc.doc_title,
      relative_path: doc.relative_path,
      source_path: doc.source_path,
      section_count: doc.sections.length,
      first_section_title: doc.sections[0]?.section_title ?? null,
      file_type: doc.file_type
    });
  }

  console.log(JSON.stringify({ scanned_count: scanned.length, items }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
