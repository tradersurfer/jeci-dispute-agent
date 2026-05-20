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
  const root = zip.folder(`JECI_Dispute_${safeName}_${date}`)!;

  root.file('README.txt', buildReadme(clientName, letters));

  for (const letter of letters) {
    const folder = root.folder(letter.bureau)!;
    folder.file(`JECI_Round${letter.round}_${letter.bureau}_Dispute.txt`, letter.content);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function buildReadme(clientName: string, letters: PackagedLetter[]): string {
  const bureauAddresses: Record<string, string> = {
    Experian:    'Experian\nP.O. Box 4500\nAllen, TX 75013',
    Equifax:     'Equifax Information Services\nP.O. Box 740256\nAtlanta, GA 30374-0256',
    TransUnion:  'TransUnion Consumer Solutions\nP.O. Box 2000\nChester, PA 19016',
  };

  const letterList = letters
    .map((l) => `  [✓] ${l.bureau} — Round ${l.round} Dispute Letter`)
    .join('\n');

  const uniqueBureaus = [...new Set(letters.map((l) => l.bureau))];
  const addressBlock = uniqueBureaus
    .map((b) => bureauAddresses[b] ?? b)
    .join('\n\n');

  return `JECI CREDIT — DISPUTE LETTER PACKAGE
AI-Powered Credit Intelligence
Find it. Fight it. Fix it.
================================================================

CLIENT:    ${clientName}
GENERATED: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
LETTERS:   ${letters.length}

INCLUDED:
${letterList}

================================================================
MAILING INSTRUCTIONS
================================================================

1. PRINT each letter on standard 8.5" x 11" paper.

2. SIGN your name where indicated: [YOUR SIGNATURE]

3. INCLUDE copies of 2 forms of ID with each letter:
   → Government-issued photo ID (driver's license, passport)
   → Proof of address (utility bill, bank statement, <60 days)

4. SEND via CERTIFIED MAIL — Return Receipt Requested.
   Keep the green card. It is legal proof of delivery.

5. NOTE the tracking number on your copy of each letter.

6. UPLOAD bureau responses to JECI Credit for Round 2.

Bureaus must respond within 30 days per FCRA 15 USC 1681i.

================================================================
BUREAU MAILING ADDRESSES
================================================================

${addressBlock}

================================================================
YOUR FCRA RIGHTS (15 USC 1681)
================================================================

You have the right to:
• Dispute inaccurate or unverifiable information at no cost
• A bureau investigation completed within 30 days
• Deletion of information that cannot be verified
• Add a 100-word consumer statement to your credit file
• Sue for $1,000 statutory damages per willful violation

Regulatory contacts:
• CFPB: consumerfinance.gov/complaint | (855) 411-2372
• FTC:  ftc.gov/complaint | 1-877-382-4357

================================================================
© ${new Date().getFullYear()} JECI Group · JECI Credit
AI-Powered Credit Intelligence
Not legal advice — FCRA dispute assistance only.
================================================================`;
}
