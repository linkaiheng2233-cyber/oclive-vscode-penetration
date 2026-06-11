import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import type { OcliveHostApi } from '@oclive/vscode-host';

import { mergePenetrationConfig, type PenetrationConfig } from './config';
import {
  pathMatchesAllowedGlobs,
  relativePosixFromWorkspace,
  resolveDiaryPath,
  resolvePenetrationDir,
} from './paths';
import {
  readPenetrationTemplates,
  rolePackPenetrationOverrides,
} from './rolePackPenetration';
import { formatDiaryEntry, summarizeDiaryForMemory } from './templates';
import {
  assertLetterPathAllowed,
  formatLetterMarkdown,
  resolveLetterPath,
} from './letterWriter';
import { showTerminalLine } from './terminalDisplay';

const TURN_COUNTER_KEY = 'oclive-penetration.turnCounters';
const DIARY_PROMPT_KEY = 'oclive-penetration.diaryPromptTurn';

type TurnCounters = Record<string, number>;

export interface AppendDiaryResult {
  ok: boolean;
  message: string;
  filePath?: string;
}

export interface WriteLetterResult {
  ok: boolean;
  message: string;
  filePath?: string;
}

export class PenetrationService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly host: OcliveHostApi,
  ) {}

  getConfig(): PenetrationConfig {
    const packDir = this.host.getRolePackPath() ?? '';
    const templates = packDir ? readPenetrationTemplates(packDir) : {};
    return mergePenetrationConfig(rolePackPenetrationOverrides(templates));
  }

  private workspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  private roleId(): string {
    const pack = this.host.getRolePackPath();
    if (pack) {
      return path.basename(pack);
    }
    return vscode.workspace.getConfiguration('oclive').get<string>('roleId', 'mumu');
  }

  private counterKey(folder: vscode.WorkspaceFolder, roleId: string): string {
    return `${folder.uri.toString()}::${roleId}`;
  }

  private async bumpTurnCount(folder: vscode.WorkspaceFolder, roleId: string): Promise<number> {
    const all = { ...this.context.globalState.get<TurnCounters>(TURN_COUNTER_KEY, {}) };
    const key = this.counterKey(folder, roleId);
    const next = (all[key] ?? 0) + 1;
    all[key] = next;
    await this.context.globalState.update(TURN_COUNTER_KEY, all);
    return next;
  }

  async revealOcliveFolder(): Promise<{ ok: boolean; message: string }> {
    const folder = this.workspaceFolder();
    if (!folder) {
      return { ok: false, message: '请先打开一个工作区文件夹' };
    }
    const dir = resolvePenetrationDir(folder.uri.fsPath, this.roleId());
    const uri = vscode.Uri.file(dir);
    if (!fs.existsSync(dir)) {
      await vscode.workspace.fs.createDirectory(uri);
    }
    await vscode.commands.executeCommand('revealInExplorer', uri);
    return { ok: true, message: `已定位 ${dir}` };
  }

  async appendDiaryFromLastTurn(
    userText: string,
    assistantText: string,
    roleName?: string,
  ): Promise<AppendDiaryResult> {
    const config = this.getConfig();
    if (!config.enabled) {
      return { ok: false, message: '渗透功能已在设置中关闭' };
    }
    const folder = this.workspaceFolder();
    if (!folder) {
      return { ok: false, message: '请先打开一个工作区文件夹' };
    }

    const roleId = this.roleId();
    const packDir = this.host.getRolePackPath() ?? '';
    const packTemplates = packDir ? readPenetrationTemplates(packDir) : {};
    if (packTemplates.enabled === false) {
      return { ok: false, message: '当前角色包已禁用渗透模板' };
    }

    const diaryTemplate = packTemplates.diaryPath ?? config.diaryPathTemplate;
    let diaryPath: string;
    try {
      diaryPath = resolveDiaryPath(folder.uri.fsPath, roleId, diaryTemplate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }

    const rel = relativePosixFromWorkspace(folder.uri.fsPath, diaryPath);
    if (!pathMatchesAllowedGlobs(rel, config.allowedGlobs)) {
      return { ok: false, message: `路径不在白名单内：${rel}` };
    }

    const entry = formatDiaryEntry({
      userText,
      assistantText,
      roleName,
      headerLine: packTemplates.diaryHeader,
    });

    const writeResult = await this.host.requestWorkspaceWrite({
      absolutePath: diaryPath,
      content: entry,
      mode: 'append',
      relativePosix: rel,
      allowedGlobs: config.allowedGlobs,
    });
    if (!writeResult.ok) {
      return { ok: false, message: writeResult.message };
    }

    if (config.previewAfterWrite) {
      const doc = await vscode.workspace.openTextDocument(diaryPath);
      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
    }

    if (config.terminalEnabled && assistantText.trim()) {
      const snippet = assistantText.trim().split(/\r?\n/)[0].slice(0, 120);
      showTerminalLine(snippet, roleName);
    }

    return { ok: true, message: `已记入日记：${rel}`, filePath: diaryPath };
  }

  async writeLetterFromDraft(
    body: string,
    roleName?: string,
    slug = 'letter',
  ): Promise<WriteLetterResult> {
    const config = this.getConfig();
    if (!config.enabled) {
      return { ok: false, message: '渗透功能已在设置中关闭' };
    }
    const folder = this.workspaceFolder();
    if (!folder) {
      return { ok: false, message: '请先打开一个工作区文件夹' };
    }
    if (!body.trim()) {
      return { ok: false, message: '信件正文不能为空' };
    }

    const roleId = this.roleId();
    const packDir = this.host.getRolePackPath() ?? '';
    const packTemplates = packDir ? readPenetrationTemplates(packDir) : {};
    if (packTemplates.enabled === false) {
      return { ok: false, message: '当前角色包已禁用渗透模板' };
    }

    const pathTemplate =
      packTemplates.letterPathTemplate ?? '.oclive/{roleId}/letters/{slug}.md';
    let letterPath: string;
    try {
      letterPath = resolveLetterPath(folder.uri.fsPath, roleId, slug, pathTemplate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }

    let rel: string;
    try {
      rel = assertLetterPathAllowed(folder.uri.fsPath, letterPath, config.allowedGlobs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }

    const markdown = formatLetterMarkdown({
      slug,
      body,
      roleName,
      template: packTemplates.letterTemplate,
    });

    const preview = markdown.slice(0, 400) + (markdown.length > 400 ? '…' : '');
    const confirm = await vscode.window.showInformationMessage(
      `预览信件（${rel}）\n\n${preview}`,
      { modal: true },
      '写入',
      '取消',
    );
    if (confirm !== '写入') {
      return { ok: false, message: '已取消写入' };
    }

    const writeResult = await this.host.requestWorkspaceWrite({
      absolutePath: letterPath,
      content: markdown,
      mode: 'write',
      relativePosix: rel,
      allowedGlobs: config.allowedGlobs,
    });
    if (!writeResult.ok) {
      return { ok: false, message: writeResult.message };
    }

    if (config.previewAfterWrite) {
      const doc = await vscode.workspace.openTextDocument(letterPath);
      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
    }

    return { ok: true, message: `已写信：${rel}`, filePath: letterPath };
  }

  async maybeAutoDiaryAfterTurn(
    userText: string,
    assistantText: string,
    roleName?: string,
  ): Promise<void> {
    const config = this.getConfig();
    const n = config.autoDiaryEveryNTurns;
    if (!config.enabled || n <= 0) {
      return;
    }
    const folder = this.workspaceFolder();
    if (!folder) {
      return;
    }
    const roleId = this.roleId();
    const count = await this.bumpTurnCount(folder, roleId);
    if (count % n !== 0) {
      return;
    }

    const promptKey = `${this.counterKey(folder, roleId)}::${count}`;
    const prompted = this.context.globalState.get<string>(DIARY_PROMPT_KEY, '');
    if (prompted === promptKey) {
      return;
    }

    const label = roleName?.trim() ? `${roleName}想` : '要把';
    const choice = await vscode.window.showInformationMessage(
      `${label}把这轮记入日记吗？（每 ${n} 轮提醒）`,
      '记入日记',
      '跳过',
    );
    await this.context.globalState.update(DIARY_PROMPT_KEY, promptKey);
    if (choice !== '记入日记') {
      return;
    }

    const result = await this.appendDiaryFromLastTurn(userText, assistantText, roleName);
    if (result.ok) {
      void vscode.window.showInformationMessage(result.message);
    }
  }

  async syncTodayDiaryToMemory(): Promise<{ ok: boolean; message: string }> {
    const config = this.getConfig();
    if (!config.memorySync.enabled) {
      return { ok: false, message: '请先在设置中开启「日记摘要提交记忆」(oclive-penetration.memorySync.enabled)' };
    }
    const folder = this.workspaceFolder();
    if (!folder) {
      return { ok: false, message: '请先打开工作区' };
    }

    const roleId = this.roleId();
    const packDir = this.host.getRolePackPath() ?? '';
    const packTemplates = packDir ? readPenetrationTemplates(packDir) : {};
    const diaryTemplate = packTemplates.diaryPath ?? config.diaryPathTemplate;
    let diaryPath: string;
    try {
      diaryPath = resolveDiaryPath(folder.uri.fsPath, roleId, diaryTemplate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }
    if (!fs.existsSync(diaryPath)) {
      return { ok: false, message: '今日尚无日记文件' };
    }
    const raw = await fs.promises.readFile(diaryPath, 'utf8').catch(() => null);
    if (!raw?.trim()) {
      return { ok: false, message: '日记文件为空' };
    }
    const summary = summarizeDiaryForMemory(raw);
    const result = await this.host.getKernelClient().bridgeDispatch('update_memory', {
      role_id: roleId,
      content: summary,
      importance: config.memorySync.importance,
    });
    if (!result.ok) {
      return { ok: false, message: result.error?.message ?? '记忆同步失败' };
    }
    return { ok: true, message: '已将日记摘要提交至长期记忆' };
  }
}
