import { Link } from "wouter";

export function SiteFooter() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-12 md:py-16">
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
          <div className="lg:w-[260px] shrink-0">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer mb-4">
                <div className="h-7 w-7 bg-brand-green rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-sm">W</span>
                </div>
                <span className="font-display font-bold text-lg text-gray-900">WhachatCRM</span>
              </div>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              The all-in-one WhatsApp CRM for teams that want to sell more, respond faster, and never lose a lead.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-12 flex-1">
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Product</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/pricing"><span className="hover:text-gray-900 transition-colors cursor-pointer">Pricing</span></Link></li>
                <li><Link href="/whatsapp-crm"><span className="hover:text-gray-900 transition-colors cursor-pointer">WhatsApp CRM</span></Link></li>
                <li><Link href="/realtor-growth-engine"><span className="hover:text-gray-900 transition-colors cursor-pointer">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>®</span> Growth Engine</span></Link></li>
                <li><Link href="/contact"><span className="hover:text-gray-900 transition-colors cursor-pointer">Contact</span></Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Resources</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><a href="/WhachatCRM-User-Guide.html"><span className="hover:text-gray-900 transition-colors cursor-pointer">Getting Started</span></a></li>
                <li><Link href="/help"><span className="hover:text-gray-900 transition-colors cursor-pointer">Help Center</span></Link></li>
                <li><Link href="/blog"><span className="hover:text-gray-900 transition-colors cursor-pointer">Blog</span></Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Comparisons</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/respond-io-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">Respond.io Alternative</span></Link></li>
                <li><Link href="/wati-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">WATI Alternative</span></Link></li>
                <li><Link href="/zoko-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">Zoko Alternative</span></Link></li>
                <li><Link href="/manychat-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">Manychat Alternative</span></Link></li>
                <li><Link href="/pabbly-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">Pabbly Alternative</span></Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">Legal</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/privacy-policy"><span className="hover:text-gray-900 transition-colors cursor-pointer">Privacy Policy</span></Link></li>
                <li><Link href="/terms-of-use"><span className="hover:text-gray-900 transition-colors cursor-pointer">Terms of Use</span></Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-400">© 2025 WhachatCRM. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
