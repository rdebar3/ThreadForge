import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Back to ThreadForge</Link>
        
        <h1 className="text-4xl font-semibold tracking-tighter mt-8 mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert max-w-none text-zinc-300 space-y-6">
          <p className="text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Information We Collect</h2>
          <p>When you use ThreadForge, we collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Account information (email, name) when you sign in via Clerk</li>
            <li>Payment information processed securely by Stripe</li>
            <li>Usage data (topics you generate threads about)</li>
            <li>Technical data (browser, device) for analytics and debugging</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide and improve the ThreadForge service</li>
            <li>Process your one-time payment</li>
            <li>Track your free generation usage</li>
            <li>Communicate with you about your account</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">3. Data Sharing</h2>
          <p>We share data with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Clerk (authentication provider)</li>
            <li>Stripe (payment processing)</li>
            <li>xAI (when using real AI generation)</li>
          </ul>
          <p>We do not sell your personal data.</p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Your Rights</h2>
          <p>You can request deletion of your account and data by contacting us.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Contact</h2>
          <p>For privacy questions, email us at <a href="mailto:hello@threadforge.app" className="text-white underline">hello@threadforge.app</a>.</p>
        </div>
      </div>
    </div>
  )
}
