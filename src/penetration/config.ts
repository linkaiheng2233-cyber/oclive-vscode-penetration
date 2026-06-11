import * as vscode from 'vscode';
import { readWorkspacePenetrationConfig } from './workspaceConfig';

export interface PenetrationIdleConfig {
  enabled: boolean;
  seconds: number;
  dailyLimit: number;
  message?: string;
}

export interface PenetrationMemorySyncConfig {
  enabled: boolean;
  importance: number;
}

export interface PenetrationConfig {
  enabled: boolean;
  diaryPathTemplate: string;
  autoDiaryEveryNTurns: number;
  allowedGlobs: string[];
  previewAfterWrite: boolean;
  terminalEnabled: boolean;
  idle: PenetrationIdleConfig;
  memorySync: PenetrationMemorySyncConfig;
}

const CFG = 'oclive-penetration';

function readUserPenetrationSettings(): PenetrationConfig {
  const cfg = vscode.workspace.getConfiguration(CFG);
  return {
    enabled: cfg.get<boolean>('enabled', true),
    diaryPathTemplate: cfg.get<string>('diaryPath', '.oclive/{roleId}/diary.md'),
    autoDiaryEveryNTurns: cfg.get<number>('autoDiaryEveryNTurns', 0),
    allowedGlobs: cfg.get<string[]>('allowedGlobs', ['.oclive/**']),
    previewAfterWrite: cfg.get<boolean>('previewAfterWrite', true),
    terminalEnabled: cfg.get<boolean>('terminal.enabled', false),
    idle: {
      enabled: cfg.get<boolean>('idle.enabled', false),
      seconds: cfg.get<number>('idle.seconds', 300),
      dailyLimit: cfg.get<number>('idle.dailyLimit', 3),
    },
    memorySync: {
      enabled: cfg.get<boolean>('memorySync.enabled', false),
      importance: cfg.get<number>('memorySync.importance', 0.6),
    },
  };
}

export function mergePenetrationConfig(
  rolePack?: {
    enabled?: boolean;
    diaryPath?: string;
    autoDiaryEveryNTurns?: number;
    allowedGlobs?: string[];
    idleMessage?: string;
  },
): PenetrationConfig {
  const workspace = readWorkspacePenetrationConfig();
  const user = readUserPenetrationSettings();
  const cfg = vscode.workspace.getConfiguration(CFG);

  const userDiaryPath = cfg.get<string>('diaryPath');
  const userAutoDiary = cfg.get<number>('autoDiaryEveryNTurns');
  const userGlobs = cfg.get<string[]>('allowedGlobs');

  return {
    enabled: rolePack?.enabled === false ? false : user.enabled,
    diaryPathTemplate:
      userDiaryPath && userDiaryPath !== '.oclive/{roleId}/diary.md'
        ? userDiaryPath
        : rolePack?.diaryPath ?? user.diaryPathTemplate,
    autoDiaryEveryNTurns:
      userAutoDiary !== undefined && userAutoDiary !== 0
        ? userAutoDiary
        : rolePack?.autoDiaryEveryNTurns ??
          workspace.autoDiaryEveryNTurns ??
          user.autoDiaryEveryNTurns,
    allowedGlobs:
      userGlobs && JSON.stringify(userGlobs) !== JSON.stringify(['.oclive/**'])
        ? userGlobs
        : rolePack?.allowedGlobs ?? workspace.allowedGlobs ?? user.allowedGlobs,
    previewAfterWrite: user.previewAfterWrite,
    terminalEnabled: user.terminalEnabled,
    idle: {
      ...user.idle,
      message: rolePack?.idleMessage,
    },
    memorySync: user.memorySync,
  };
}
