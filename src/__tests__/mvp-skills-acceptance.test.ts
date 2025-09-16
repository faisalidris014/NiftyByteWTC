import * as fs from 'fs';
import * as path from 'path';

type SkillMetadata = {
  id: string;
  name: string;
  description: string;
  os: string[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresAdmin: boolean;
  script?: string;
  windowsScript?: string;
  unixScript?: string;
  output: { success: string; failure: string };
};

const SKILL_ROOT = path.join(__dirname, '../../skills');
const DISALLOWED_PATTERNS = [
  /Invoke-Expression/i,
  /IEX\s/i,
  /Add-Type/i,
  /Set-ExecutionPolicy/i
];

describe('MVP skill package validation', () => {
  const skillDefinitions: Array<{ id: string; file: string; scripts: string[] }> = [
    { id: 'wifi-reset', file: 'wifi-reset.json', scripts: ['wifi-reset.ps1'] },
    { id: 'printer-queue-clear', file: 'printer-queue-clear.json', scripts: ['printer-queue-clear.ps1'] },
    { id: 'word-file-recovery', file: 'word-file-recovery.json', scripts: ['word-file-recovery.ps1'] },
    { id: 'app-cache-reset', file: 'app-cache-reset.json', scripts: ['app-cache-reset.ps1'] },
    { id: 'disk-space', file: 'disk-space.json', scripts: ['disk-space.ps1', 'disk-space.sh'] },
    { id: 'system-info', file: 'system-info.json', scripts: ['system-info.ps1'] }
  ];

  it('ensures all skill metadata files exist and are valid JSON', () => {
    for (const definition of skillDefinitions) {
      const filePath = path.join(SKILL_ROOT, definition.file);
      expect(fs.existsSync(filePath)).toBe(true);
      const contents = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(contents) as SkillMetadata;
      expect(parsed.id).toBe(definition.id);
      expect(parsed.name.length).toBeGreaterThan(3);
      expect(parsed.description.length).toBeGreaterThan(10);
      expect(Array.isArray(parsed.os)).toBe(true);
      expect(parsed.output.success.length).toBeGreaterThan(5);
      expect(parsed.output.failure.length).toBeGreaterThan(5);
    }
  });

  it('ensures all declared scripts are present and do not include disallowed commands', () => {
    for (const definition of skillDefinitions) {
      const metadataPath = path.join(SKILL_ROOT, definition.file);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as SkillMetadata;
      const declaredScripts = [
        metadata.script,
        metadata.windowsScript,
        metadata.unixScript
      ].filter(Boolean) as string[];
      const expectedScripts = new Set(definition.scripts);

      for (const script of declaredScripts) {
        expect(expectedScripts.has(script)).toBe(true);
        const scriptPath = path.join(SKILL_ROOT, script);
        expect(fs.existsSync(scriptPath)).toBe(true);
        const content = fs.readFileSync(scriptPath, 'utf-8');
        expect(content).toMatch(/SUCCESS:/);
        for (const pattern of DISALLOWED_PATTERNS) {
          expect(pattern.test(content)).toBe(false);
        }
      }
    }
  });
});
