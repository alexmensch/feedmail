# Product Strategy

## Strategic Thesis

feedmail will succeed by being the simplest possible answer to a specific question: "I have a blog with an RSS feed — how do I let people subscribe by email?" It is not a newsletter platform. It does not offer campaign design, audience segmentation, analytics dashboards, or marketing automation. It is a pipe: RSS goes in, emails come out. This deliberate narrowness is the core bet.

The target user is someone who already runs a personal website — typically built with a static site generator like Eleventy, Hugo, or Jekyll — and already publishes via RSS. They chose a static site over WordPress or Squarespace because they value ownership, simplicity, and creative control over their corner of the internet. They would choose feedmail for the same reasons: it extends their existing publishing workflow rather than replacing it with a platform they have to learn and manage.

The competitive landscape validates this positioning. Managed newsletter services like Buttondown charge $9/month for RSS-to-email functionality and pull users into a platform with its own subscriber management, templates, and analytics. Self-hosted alternatives like Listmonk are full newsletter platforms requiring a VPS, PostgreSQL, Docker, and ongoing server maintenance — a meaningful operational commitment even for technically skilled users. feedmail occupies a gap neither serves: self-hosted email delivery with no infrastructure to manage and no platform to learn. Deploy it once alongside your static site and it does its job without ongoing attention.

This is a craft project first. Success means a focused, well-built tool that a few hundred to a few thousand personal site owners genuinely love using. Community adoption, if it comes, will follow from the quality of the tool and the clarity of its purpose — not from growth tactics. The ambition is to be the obvious answer in the static site community, not to capture a market.

---

## Differentiation

feedmail's primary differentiator is scope, not technology. Where every competitor — managed or self-hosted — offers a newsletter platform with features designed for professional newsletter operators, feedmail does exactly one thing: deliver RSS feed items to email subscribers. This constraint is the product. A personal blogger who just wants readers to get posts by email does not need campaign analytics, A/B testing, subscriber segments, or template builders. They need a pipe that works.

The secondary differentiator is operational simplicity. feedmail runs on Cloudflare Workers with D1 for storage, requiring no servers, no containers, no databases to manage, and no ongoing maintenance beyond the application itself. For someone already using Cloudflare (even just for DNS), adding feedmail is closer to configuring a feature than deploying infrastructure. This is a meaningful advantage over Listmonk and other self-hosted tools that require provisioning and maintaining a server.

Cost is a supporting differentiator, not the primary one. On Cloudflare's free tier with a low-cost email provider like Amazon SES (~$0.10 per 1,000 emails), feedmail costs pennies per month for a typical personal blog — compared to $9/month for Buttondown's RSS-to-email feature or $20/month+ for managed services at scale. The cost advantage is real but secondary to ownership: the user controls their subscriber list, their sending infrastructure, and their data, with no vendor lock-in and no platform that can change terms or pricing underneath them.

feedmail does not currently differentiate on distribution, brand recognition, or community size. It is unknown in the static site ecosystem. This is the primary weakness. The plan to address it is through writing (blog posts about the RSS-to-email problem and the Cloudflare publishing stack) and direct engagement in SSG communities (Eleventy, Hugo, Astro forums and Discord servers). These are slow-build strategies consistent with the craft-project ambition.

---

## Market Context

The managed newsletter market is large and fragmented, but only a narrow slice of it is relevant. Personal bloggers who want RSS-to-email are not the target audience for beehiiv, Substack, or ConvertKit — those platforms serve professional newsletter creators and media businesses. The relevant competitors are:

Buttondown is the closest managed alternative. It is built by a solo developer, targets writers over marketers, and offers RSS-to-email as a paid add-on ($9/month on top of any plan tier). Its free tier covers up to 100 subscribers but does not include RSS-to-email. Buttondown is well-regarded in the Eleventy community specifically, with dedicated plugins and blog posts recommending it. It is the default answer when someone in an SSG community asks "how do I add email subscriptions to my blog?"

Listmonk is the dominant self-hosted alternative. It has over 16,000 GitHub stars, active development, and is a full-featured newsletter platform (subscriber management, campaign creation, analytics, bounce handling). It requires a VPS, PostgreSQL, and Docker. Setup takes hours to days, and email delivery requires separately configuring an SMTP provider — a process documented as frustrating, with AWS SES sometimes rejecting applications outright. Listmonk serves people who want to operate a newsletter. feedmail serves people who want to *not* operate a newsletter.

Mailchimp has become less relevant for personal blogs. Its free tier was cut to 500 contacts in 2023, and as of mid-2025 it discontinued RSS campaign automation on free plans entirely, pushing that feature to paid tiers starting at $13/month. It is increasingly positioned for business and e-commerce users.

The broader context is a slow but real movement toward platform independence among personal site owners. The IndieWeb community advocates for owning your publishing infrastructure. Substack controversies have driven some writers to self-hosted alternatives. Mailchimp's pricing changes have pushed small publishers to look elsewhere. This creates a receptive audience for feedmail's message, but most of that audience will pragmatically choose a managed service unless the self-hosted option is dramatically simpler. That is the bar feedmail must clear.

feedmail currently runs only on Cloudflare Workers. Cloudflare is converging its Workers and Pages products into a single unified platform — all investment and feature work is going into Workers, and existing Pages projects will eventually be auto-migrated. This convergence is a tailwind for feedmail: as static site owners on Cloudflare increasingly use Workers for hosting (static assets are now natively supported in Workers), feedmail and a user's site would run on the same platform with the same tooling and deploy pipeline. However, Netlify, Vercel, and GitHub Pages still host a large share of static sites, so the Cloudflare-only deployment limits the immediately addressable audience to those already on Cloudflare or willing to adopt it. The strategy is to prove the concept on Cloudflare first, then expand to other deployment targets based on demand. feedmail is not architecturally dependent on Cloudflare — the email provider is pluggable (currently Resend, with plans to support SES and others), and the application logic could be adapted to other serverless platforms.

---

## Risks and Open Questions

- **Distribution is unproven.** feedmail has no users beyond its creator, no community presence in SSG spaces, and no content strategy in motion. The plan (writing + community engagement) is plausible but unstarted. Writing and community engagement require sustained personal effort that competes with development time. **Next step:** Write and publish a first blog post explaining the problem feedmail solves and share it in at least one SSG community (e.g., Eleventy Discord).

- **Cloudflare-only deployment limits the audience.** Most static site owners are on Netlify, Vercel, or GitHub Pages, not Cloudflare. Requiring Cloudflare Workers means feedmail is invisible to the majority of its target users. **Next step:** Research what fraction of SSG users are on Cloudflare vs. other platforms. Consider whether a Docker/container deployment option or Terraform configurations for other platforms would meaningfully broaden the audience without undermining the zero-ops positioning.

- **The "pipe not a platform" positioning is untested.** It is plausible that personal bloggers want exactly this. It is also plausible that once they have subscribers, they want to know open rates, or send occasional non-RSS updates, or customise email templates — and feedmail's deliberate constraints become frustrating. **Next step:** Get feedmail in front of 5–10 real users (not the creator) and observe whether the constraint feels like focus or limitation.

- **Email provider economics are unclear at scale.** The near-zero cost claim depends on email providers with generous free tiers or low per-email pricing. Resend's free tier caps at 100 emails/day. SES pricing is favourable but requires AWS account setup. Cloudflare Email Sending is in controlled beta with no public timeline or pricing. **Next step:** Add SES as a supported email provider to give users a proven, low-cost option that exists today.

- **Competitive claims are partially validated.** The market research confirmed Buttondown's $9/month RSS-to-email pricing and Listmonk's operational complexity. However, claims about the size of the addressable audience ("static site owners who want self-hosted email delivery") and the strength of the ownership motivation are based on the creator's own experience, not user research. **Next step:** Monitor community conversations about newsletter tools in SSG forums to gauge real demand before investing heavily in features that assume a large audience.

- **Single-maintainer sustainability.** feedmail is built and maintained by one person. LLM-assisted development dramatically accelerates feature delivery, but community support, bug triage, documentation, and ecosystem engagement still require human time and attention. If feedmail gains users, the support burden may compete with the craft ethos. **Next step:** No immediate action needed, but keep this tension in mind when deciding whether to actively promote adoption vs. letting it grow organically.
