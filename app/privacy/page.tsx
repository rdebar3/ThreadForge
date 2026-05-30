import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Back to ThreadForge</Link>
        
        <h1 className="text-4xl font-semibold tracking-tighter mt-8 mb-8">Privacy Policy</h1>
        
        <p className="text-sm text-zinc-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none text-zinc-300 space-y-6 text-[15px] leading-relaxed">

          <h2 className="text-xl font-semibold text-white mt-10">1. Information We Collect</h2>
          <p>When you use ThreadForge, we collect the following information:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Account Information:</strong> Email address and basic profile data when you sign in via Google or email (handled through Clerk).</li>
            <li><strong>Payment Information:</strong> We do not store your credit card details. All payments are processed securely by Stripe.</li>
            <li><strong>Usage Data:</strong> Topics you submit for thread generation and how many generations you have used.</li>
            <li><strong>Technical Data:</strong> Basic device and browser information for analytics and security.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-10">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide and operate the ThreadForge service</li>
            <li>Process your one-time $9 payment and grant unlimited access</li>
            <li>Enforce our free tier limits (3 generations)</li>
            <li>Improve the quality and reliability of the service</li>
            <li>Communicate with you about your account or important updates</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-10">3. Data Sharing</h2>
          <p>We share your information with the following trusted third parties:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Clerk</strong> — for user authentication and account management</li>
            <li><strong>Stripe</strong> — for secure payment processing</li>
            <li><strong>xAI (Grok)</strong> — to generate threads based on the topics you provide</li>
            <li><strong>Vercel</strong> — to host the website</li>
          </ul>
          <p>We do not sell your personal data to third parties.</p>

          <h2 className="text-xl font-semibold text-white mt-10">4. Data Retention</h2>
          <p>We retain your account information and payment records for as long as your account is active or as needed to comply with legal obligations. You may request deletion of your data at any time.</p>

          <h2 className="text-xl font-semibold text-white mt-10">5. Your Rights</h2>
          <p>Depending on your location, you may have the right to access, correct, or delete the personal information we hold about you. To make such a request, please email us at <a href="mailto:legal@threadforge.com" className="text-white underline">legal@threadforge.com</a>.</p>

          <h2 className="text-xl font-semibold text-white mt-10">6. Security</h2>
          <p>We take reasonable measures to protect your information. However, no method of transmission over the Internet is completely secure.</p>

          <h2 className="text-xl font-semibold text-white mt-10">7. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will update the "Last updated" date at the top of this page when changes are made.</p>

          <h2 className="text-xl font-semibold text-white mt-10">8. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us at:</p>
          <p><a href="mailto:legal@threadforge.com" className="text-white underline">legal@threadforge.com</a></p>

        </div>
      </div>
    </div>
  )
}
