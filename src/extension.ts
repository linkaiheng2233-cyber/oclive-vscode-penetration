import * as vscode from 'vscode';

import { HOST_API_VERSION, resolveOcliveHost } from '@oclive/vscode-host';

import { PenetrationIdleMonitor } from './penetration/idleMonitor';
import { mergePenetrationConfig } from './penetration/config';
import {
  readPenetrationTemplates,
  rolePackPenetrationOverrides,
} from './penetration/rolePackPenetration';
import { PenetrationService } from './penetration/penetrationService';

let penetration: PenetrationService | undefined;
let lastRoleName = '';

function penetrationConfigForIdle(host: NonNullable<ReturnType<typeof resolveOcliveHost>>) {
  const packDir = host.getRolePackPath() ?? '';
  const templates = packDir ? readPenetrationTemplates(packDir) : {};
  return mergePenetrationConfig(rolePackPenetrationOverrides(templates));
}

export function activate(context: vscode.ExtensionContext): void {
  const host = resolveOcliveHost();
  if (!host) {
    void vscode.window.showWarningMessage(
      'OCLive 渗透插件需要核心扩展 oclive.oclive-vscode。请先安装并启用核心扩展。',
    );
    return;
  }
  if (host.apiVersion !== HOST_API_VERSION) {
    void vscode.window.showWarningMessage(
      'OCLive 宿主 API 版本不匹配，请升级核心扩展与渗透插件。',
    );
    return;
  }

  penetration = new PenetrationService(context, host);

  context.subscriptions.push(
    host.registerChatToolbarAction({
      id: 'diary',
      label: '记入日记',
      command: 'oclive-penetration.appendDiary',
      icon: '📓',
      title: '将最近一轮对话记入工作区日记',
    }),
    host.registerChatToolbarAction({
      id: 'letter',
      label: '写信',
      command: 'oclive-penetration.writeLetter',
      icon: '✉',
      title: '写一封信到 .oclive/letters/',
    }),
  );

  context.subscriptions.push(
    host.onChatTurnCompleted((e) => {
      lastRoleName = e.roleName;
      void penetration?.maybeAutoDiaryAfterTurn(e.userText, e.reply, e.roleName);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive-penetration.appendDiary', async () => {
      const turn = host.getRecentTurn();
      if (!turn) {
        void vscode.window.showWarningMessage('尚无完整的一轮对话可记入日记');
        return;
      }
      const result = await penetration?.appendDiaryFromLastTurn(
        turn.userText,
        turn.assistantText,
        lastRoleName,
      );
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result) {
        void vscode.window.showWarningMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive-penetration.writeLetter', async () => {
      const turn = host.getRecentTurn();
      const roleName = lastRoleName;
      const draft = turn
        ? `## 对话摘录\n\n**你**：${turn.userText}\n\n**角色**：${turn.assistantText}\n`
        : '';
      const body =
        (await vscode.window.showInputBox({
          title: '写一封信',
          prompt: '正文（可编辑草稿）',
          value: draft,
          ignoreFocusOut: true,
        })) ?? '';
      if (!body.trim()) {
        return;
      }
      const result = await penetration?.writeLetterFromDraft(body, roleName);
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result && result.message !== '已取消写入') {
        void vscode.window.showWarningMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive-penetration.revealOcliveFolder', async () => {
      const result = await penetration?.revealOcliveFolder();
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result) {
        void vscode.window.showWarningMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive-penetration.syncDiaryMemory', async () => {
      const result = await penetration?.syncTodayDiaryToMemory();
      if (result?.ok) {
        void vscode.window.showInformationMessage(result.message);
      } else if (result) {
        void vscode.window.showWarningMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oclive-penetration.openSettings', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:oclive.oclive-vscode-penetration',
      );
    }),
  );

  const idleMonitor = new PenetrationIdleMonitor(
    context,
    () => penetrationConfigForIdle(host).idle,
    () => {
      void vscode.commands.executeCommand('oclive.openChat');
      const msg =
        penetrationConfigForIdle(host).idle.message?.trim() ||
        '角色在等你回来聊聊…';
      void vscode.window.showInformationMessage(msg);
    },
  );
  context.subscriptions.push(idleMonitor);
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      idleMonitor.touch();
    }),
  );
}

export function deactivate(): void {
  penetration = undefined;
}
