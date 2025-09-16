import * as fs from 'fs';
import * as path from 'path';

describe('Packaging and deployment configuration', () => {
  const root = path.join(__dirname, '../..');

  it('includes electron-updater dependency and packaging scripts', () => {
    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as any;

    expect(pkg.dependencies['electron-updater']).toBeDefined();

    const scripts = pkg.scripts || {};
    expect(scripts['dist:win']).toBeDefined();
    expect(scripts['dist:win-msi']).toBeDefined();

    const buildConfig = pkg.build || {};
    expect(Array.isArray(buildConfig.publish)).toBe(true);
    expect(buildConfig.publish[0].url).toContain('https://');
    expect(buildConfig.win).toBeDefined();
  });

  it('has update channel configuration for stable and pilot', () => {
    const configPath = path.join(root, 'config', 'update-config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as any;

    expect(config.defaultChannel).toBe('stable');
    expect(Object.keys(config.channels || {})).toEqual(expect.arrayContaining(['stable', 'pilot']));
  });

  it('defines enterprise deployment defaults with rollback information', () => {
    const enterprisePath = path.join(root, 'build', 'enterprise-config.json');
    expect(fs.existsSync(enterprisePath)).toBe(true);
    const enterprise = JSON.parse(fs.readFileSync(enterprisePath, 'utf-8')) as any;

    expect(enterprise.application.updateChannel).toBe('stable');
    expect(enterprise.rollback).toBeDefined();
  });

  it('provides a rollback PowerShell script', () => {
    const rollbackPath = path.join(root, 'build', 'rollback.ps1');
    expect(fs.existsSync(rollbackPath)).toBe(true);
    const content = fs.readFileSync(rollbackPath, 'utf-8');
    expect(content).toMatch(/param\(/i);
    expect(content).toMatch(/msiexec/i);
  });
});
