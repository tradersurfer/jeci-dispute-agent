// ============================================================
// JECI AI — Mastra Dispute Agent
// 700 Credit Club Experts | JECI Group
// ============================================================

import { Agent, createTool } from '@mastra/core';
import { z }                  from 'zod';

import { analyzeReport }              from '../tools/reportAnalyzer.js';
import { generateDisputeLetter }      from '../tools/letterGenerator.js';
import { getCRCClient, addCRCNote, updatePipelineStage } from '../tools/crcClient.js';
import { notifySlack }                from '../tools/slackNotifier.js';
import { CreditReport }               from '../types/index.js';

// ── Tool: Analyze Credit Report ──────────────────────────────

const analyzeReportTool = createTool({
  id: 'analyze_credit_report',
  description:
    'Analyzes a credit report for FCRA/FDCPA violations and disputable items. ' +
    'Returns a prioritized list of dispute targets with legal citations.',
  inputSchema: z.object({
    report: z.any().describe('The parsed CreditReport object'),
  }),
  execute: async ({ context }) => {
    const analysis = analyzeReport(context.report as CreditReport);
    return {
      totalItems:        analysis.disputeItems.length,
      quickWins:         analysis.quickWins.length,
      estimatedRecovery: analysis.estimatedPointRecovery,
      humanReviewNeeded: analysis.humanReviewRequired,
      summary:           analysis.summary,
      topItems:          analysis.disputeItems.slice(0, 10).map(i => ({
        creditor: i.creditorName,
        reason:   i.reasonDescription,
        priority: i.priority,
        bureau:   i.bureau,
        rate:     i.expectedDeletionRate,
      })),
    };
  },
});

// ── Tool: Generate Single Dispute Letter ─────────────────────

const generateLetterTool = createTool({
  id: 'generate_dispute_letter',
  description: 'Generates a single FCRA/FDCPA-compliant dispute letter for a specific bureau and round.',
  inputSchema: z.object({
    clientName:    z.string(),
    clientAddress: z.string(),
    bureau:        z.enum(['Equifax', 'Experian', 'TransUnion']),
    round:         z.number().int().min(1).max(3),
    items:         z.any().describe('Array of DisputeItem objects'),
  }),
  execute: async ({ context }) => {
    const letter = await generateDisputeLetter(
      {
        clientName:    context.clientName,
        clientAddress: context.clientAddress,
        bureau:        context.bureau as 'Equifax' | 'Experian' | 'TransUnion',
        items:         context.items,
      },
      context.round as 1 | 2 | 3,
    );
    return {
      filename:  letter.filename,
      bureau:    letter.bureau,
      round:     letter.round,
      preview:   letter.letterContent.slice(0, 200) + '...',
      generated: letter.generatedAt,
    };
  },
});

// ── Tool: Get CRC Client ─────────────────────────────────────

const getClientTool = createTool({
  id: 'get_crc_client',
  description: 'Fetches client profile from Credit Repair Cloud.',
  inputSchema: z.object({
    clientId: z.string(),
  }),
  execute: async ({ context }) => {
    const client = await getCRCClient(context.clientId);
    return client;
  },
});

// ── Tool: Update Pipeline Stage ──────────────────────────────

const updateStageTool = createTool({
  id: 'update_pipeline_stage',
  description: 'Moves a client to a new stage in the CRC pipeline.',
  inputSchema: z.object({
    clientId: z.string(),
    stage:    z.string(),
  }),
  execute: async ({ context }) => {
    await updatePipelineStage(context.clientId, context.stage as any);
    return { success: true, clientId: context.clientId, stage: context.stage };
  },
});

// ── Tool: Add CRC Note ───────────────────────────────────────

const addNoteTool = createTool({
  id: 'add_crc_note',
  description: 'Adds a note to a client\'s CRC file.',
  inputSchema: z.object({
    clientId: z.string(),
    note:     z.string(),
  }),
  execute: async ({ context }) => {
    await addCRCNote(context.clientId, context.note);
    return { success: true };
  },
});

// ── Tool: Slack Notify ───────────────────────────────────────

const slackTool = createTool({
  id: 'slack_notify',
  description: 'Sends a notification to the 700 Credit Club Slack workspace.',
  inputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ context }) => {
    await notifySlack(context.message);
    return { sent: true };
  },
});

// ── The Agent ────────────────────────────────────────────────

export const jecAIAgent = new Agent({
  name: '700CreditAI',

  instructions: `
You are JECI AI, the expert Consumer Law Restoration agent for 700 Credit Club Experts.
You operate under FCRA (15 USC 1681), FDCPA (15 USC 1692), and CROA.

Your mission: Analyze credit reports, identify every disputable inaccuracy, 
generate legally precise dispute letters, and manage the 3-round dispute process.

Core principles:
1. ACCURACY FIRST — Never dispute accurate items. Only challenge inaccuracies.
2. LEGAL GROUNDING — Every dispute must cite specific statute sections.
3. PRIORITY ORDER — Always tackle CRITICAL items first, then HIGH, MEDIUM, LOW.
4. ESCALATION PATH — Round 1 (bureaus) → Round 2 (creditors) → Round 3 (legal).
5. HUMAN ESCALATION — Flag items requiring attorney review immediately via Slack.
6. COMPLIANCE — All actions must remain FCRA/FDCPA/CROA compliant.

When analyzing a report:
- Use analyze_credit_report tool first
- Always notify Slack of analysis results
- Flag any human review items immediately
- Recommend round based on analysis

When generating letters:
- One letter per bureau per round
- Use generate_dispute_letter for each bureau
- Always log activity with add_crc_note
- Update pipeline stage after completion

You represent 700 Credit Club Experts. Every action you take reflects on 
the firm's "Legal, Moral, Ethical & Factual Credit Services" standard.
  `.trim(),

  tools: {
    analyze_credit_report: analyzeReportTool,
    generate_dispute_letter: generateLetterTool,
    get_crc_client: getClientTool,
    update_pipeline_stage: updateStageTool,
    add_crc_note: addNoteTool,
    slack_notify: slackTool,
  },
});
