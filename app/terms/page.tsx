import Link from 'next/link'

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Back to ThreadForge</Link>
        
        <h1 className="text-4xl font-semibold tracking-tighter mt-8 mb-8">Terms of Service</h1>
        
        <div className="prose prose-invert max-w-none text-zinc-300 space-y-6">
          <p className="text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Service Description</h2>
          <p>ThreadForge provides an AI-powered tool to generate X/Twitter threads from topics you provide.</p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Pricing</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Free tier: 3 generations per browser/device</li>
            <li>Unlimited access: One-time payment of $9 (non-refundable after use)</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">3. User Accounts</h2>
          <p>Signing in is optional but recommended. Paid access is tied to your Clerk account when you are signed in.</p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Acceptable Use</h2>
          <p>You agree not to use ThreadForge to generate spam, illegal content, or content that violates X's rules.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Limitation of Liability</h2>
          <p>ThreadForge is provided "as is". We are not responsible for the quality or performance of generated content.</p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Changes</h2>
          <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
        </div>
      </div>
    </div>
  )
}
