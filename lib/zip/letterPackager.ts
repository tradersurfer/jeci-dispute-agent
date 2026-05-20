import JSZip from 'jszip';
import { format } from 'date-fns';

export interface PackagedLetter {
  bureau: 'Experian' | 'Equifax' | 'TransUnion';
  round: number;
  content: string;
}

export async function buildDisputeZip(
  letters: PackagedLetter[],
  clientName: string
): Promise<Buffer> {
  const zip = new JSZip();
  const date = format(new Date(), 'yyyy-MM-dd');
  const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const folderName = `Credora_Dispute_${safeName}_${date}`;
  const root = zip.folder(folderName)!;

  root.file('README.txt', buildReadme(clientName, letters));

  for (const letter of letters) {
    const bureauFolder = root.folder(letter.bureau)!;
    bureauFolder.file(
      `Dispute_Letter_${letter.bureau}_Round${letter.round}.txt`,
      letter.content
    );
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function buildReadme(clientName: string, letters: PackagedLetter[]): string {
  const bureauAddresses: Record<string, string> = {
    Experian: 'Experian\nP.O. Box 4500\nAllen, TX 75013',
    Equifax: 'Equifax Information Services\nP.O. Box 740256\nAtlanta, GA 30374-0256',
    TransUnion: 'TransUnion Consumer Solutions\nP.O. Box 2000\nChester, PA 19016',
  };

  const letterList = letters
    .map((l) => `  • ${l.bureau} — Round ${l.round} Dispute Letter`)
    .join('\n');

  const addressBlock = [...new Set(letters.map((l) => l.bureau))]
    .map((b) => bureauAddresses[b] ?? b)
    .join('\n\n');

  return `╔══════════════════════════════════════════════════════════╗
║          CREDORA AI — DISPUTE LETTER PACKAGE             ║
║              AI-Powered Credit Intelligence              ║
╚══════════════════════════════════════════════════════════╝

Client:    ${clientName}
Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
Letters:   ${letters.length}

INCLUDED LETTERS:
${letterList}

══════════════════════════════════════════════════════════
MAILING INSTRUCTIONS
══════════════════════════════════════════════════════════

1. PRINT each letter on 8.5" x 11" white paper.

2. SIGN where indicated — look for: [YOUR SIGNATURE]

3. INCLUDE a copy of 2 forms of ID (driver's license +
   utility bill or bank statement showing your address).

4. SEND via CERTIFIED MAIL with Return Receipt Requested.
   • Keep your green return receipt card as legal proof.
   • FCRA requires bureaus to respond within 30 days.

5. NOTE the certified mail tracking number on each letter.

6. UPLOAD bureau responses to Credora AI for Round 2
   analysis when you receive them (usually 3–5 weeks).

══════════════════════════════════════════════════════════
BUREAU MAILING ADDRESSES
══════════════════════════════════════════════════════════

${addressBlock}

══════════════════════════════════════════════════════════
YOUR FCRA RIGHTS
══════════════════════════════════════════════════════════

Under the Fair Credit Reporting Act (15 USC 1681):
• Credit bureaus must investigate disputes within 30 days.
• Unverifiable information must be deleted.
• You may dispute inaccurate information at no cost.
• You may add a 100-word consumer statement to your file.

For violations of your rights, contact:
• CFPB: consumerfinance.gov/complaint | (855) 411-2372
• FTC: ftc.gov/complaint | 1-877-FTC-HELP

══════════════════════════════════════════════════════════
Credora AI | Powered by 700 Credit Club
Legal. Moral. Ethical & Factual Credit Services.
© ${new Date().getFullYear()} JECI Group
══════════════════════════════════════════════════════════`;
}
