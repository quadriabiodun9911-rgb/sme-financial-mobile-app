/**
 * Blog content — plain data, no CMS, database, or markdown dependency. To
 * publish an article: add an object to BLOG_POSTS below, commit, and push
 * — it goes live on the next deploy at /blog/<slug>.
 *
 * `slug` becomes the URL and must be unique and URL-safe (lowercase,
 * hyphens, no spaces). `body` is a list of content blocks rendered in
 * order — paragraph, heading, or list — there's no markdown/HTML parsing,
 * so structure content using these block types rather than inline syntax.
 */
export type BlogBodyBlock =
    | { type: 'paragraph'; text: string }
    | { type: 'heading'; text: string }
    | { type: 'list'; items: string[] };

export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    /** ISO date, e.g. '2026-08-16' */
    publishedDate: string;
    author: string;
    body: BlogBodyBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
    {
        slug: 'ebid-signal-sme-capital-readiness',
        title: 'EBID Is Sending a Signal About Where Capital Is Going',
        excerpt: "EBID's new GRO Strategy is directing more institutional capital toward West African SMEs. But capital availability isn't the same as capital accessibility — and closing that gap is the real opportunity ahead.",
        publishedDate: '2026-08-16',
        author: 'Quad360 Team',
        body: [
            { type: 'paragraph', text: "EBID's increased focus on SME financing sends an important signal across West Africa: more institutional capital is being directed toward the businesses expected to drive regional growth. But increasing the supply of capital is only one side of the equation. The bigger question is whether SMEs are financially visible, prepared, and ready to absorb it." },
            { type: 'paragraph', text: 'The conversation around African SMEs has often focused on one problem: there is not enough financing. That problem is real. But the latest direction from the ECOWAS Bank for Investment and Development (EBID) suggests that another question deserves much more attention: what happens when more capital becomes available, but many businesses are not yet ready to receive it?' },
            { type: 'paragraph', text: "EBID's GRO Strategy 2026–2030 allocates 22% of new commitments to direct SME financing, while the private sector represents 63% of new approvals. These figures, confirmed across EBID's own announcements and independent coverage, represent more than a financing target — they signal a broader shift toward using institutional capital to support private-sector growth and SMEs across the ECOWAS region." },
            { type: 'paragraph', text: 'And that raises an important question: are the businesses on the other side of that capital ready for it?' },

            { type: 'heading', text: 'How the Capital Actually Moves' },
            { type: 'paragraph', text: "EBID's approach highlights an important feature of development finance. Capital does not always move directly from a development finance institution to an individual SME. Instead, development finance institutions can work through banks and other financial intermediaries by providing credit lines and other financing facilities — a structure that looks like: Development Finance Institution → Financial Institution → SME." },
            { type: 'paragraph', text: 'This model has an important advantage. Local financial institutions already have relationships with businesses. They understand their markets, sectors, customers, and operating environments. Development finance institutions can use those networks to extend the reach of institutional capital — resulting in greater financing capacity for SMEs. But another question remains: how do we identify and prepare the businesses that are ready to receive that capital?' },

            { type: 'heading', text: 'The Financing Gap Is Also an Information Gap' },
            { type: 'paragraph', text: 'Consider a growing SME. The owner may know that sales are increasing, that demand is strong, that customers owe the business money, and that additional inventory, equipment, employees, or working capital could accelerate growth. But can the business clearly demonstrate:' },
            { type: 'list', items: [
                'How much revenue it generates',
                'How consistent that revenue is',
                'Whether the business is actually profitable',
                'What its margins look like',
                'How much cash it generates',
                'What its existing financial obligations are',
                'How much additional debt it could realistically support',
                'How much capital it actually needs',
                'What exactly the capital will be used for',
                'What evidence supports its growth expectations',
            ] },
            { type: 'paragraph', text: 'These questions matter because capital providers are not simply financing ideas — they are assessing businesses. Businesses that cannot clearly explain their financial position can struggle to translate commercial potential into financeability. A business can be commercially promising without being financially ready for capital.' },

            { type: 'heading', text: 'Capital Available Is Not the Same as Capital Accessible' },
            { type: 'paragraph', text: 'This is where the SME financing conversation needs to become more sophisticated. We often measure success by asking how much money has been made available to SMEs. But another set of questions matters just as much:' },
            { type: 'list', items: [
                'How many SMEs are actually ready for that money?',
                'How many can demonstrate their financial health?',
                'How many have reliable financial records?',
                'How many can clearly articulate their capital requirements?',
                'How many can demonstrate repayment capacity where debt is appropriate?',
                'How many can present an investment case supported by credible financial information?',
            ] },
            { type: 'paragraph', text: 'The gap between capital available and capital accessible can be significant. A financing facility can exist. A bank can have liquidity. A development finance institution can establish a dedicated SME programme. An investor can actively seek opportunities. And yet an SME can remain outside the financing system because its financial information is incomplete, inconsistent, or difficult to interpret. That is not simply a financing problem — it is an information and infrastructure problem.' },

            { type: 'heading', text: 'The Missing Layer' },
            { type: 'paragraph', text: 'For more institutional capital to reach African SMEs, the ecosystem needs more than capital and distribution. SMEs need better ways to understand their own financial position. Capital providers need better-prepared businesses and structured financial information. And the ecosystem needs a more effective pathway connecting the two: SME → Financial Data → Financial Intelligence → Financial Readiness → Capital Provider.' },
            { type: 'paragraph', text: 'This does not mean replacing a bank\'s underwriting process. It does not mean replacing an investor\'s due diligence. It does not mean guaranteeing financing. It means helping businesses arrive at those processes better prepared.' },

            { type: 'heading', text: 'From Financial Data to Capital Readiness' },
            { type: 'paragraph', text: 'Imagine an SME preparing to seek financing. Instead of starting with "I need ₦50 million," the business should be able to demonstrate its revenue history, its profitability, its cash-flow position, how it has grown, its current financial health, how much capital it requires, exactly what the capital will finance, and the expected business impact.' },
            { type: 'paragraph', text: 'That creates a much more informed conversation between the business and the capital provider. It doesn\'t eliminate underwriting, replace due diligence, or guarantee approval — but it can better prepare the business for the financing process. The conversation should move from "I need money" to "here is my financial position, here is the opportunity, here is what I need, here is why I need it, and here is how the capital will support the business." That is a very different conversation.' },

            { type: 'heading', text: 'What This Means for Banks, Investors, and DFIs' },
            { type: 'paragraph', text: 'The opportunity is not only on the SME side. Banks, investors, development finance institutions, and other capital providers also need better ways to identify and understand businesses. A more structured SME financial ecosystem could create a pathway such as: SME → Financial Data → Financial Intelligence → Financial Readiness → Capital Matching → Capital Provider.' },
            { type: 'list', items: [
                'For lenders: engaging with businesses that have developed a clearer financial profile before entering the financing process.',
                'For investors: another channel for discovering businesses that are actively improving their financial readiness.',
                'For development finance institutions: a potentially stronger pipeline beneath SME financing programmes delivered through local financial institutions.',
            ] },
            { type: 'paragraph', text: 'The capital provider would still make the final financing or investment decision. But the quality, consistency, and structure of the information available before that decision could improve — and better capital allocation does not come only from having more money. It also comes from having better information about where that money can be deployed effectively.' },

            { type: 'heading', text: 'This Is the Problem Quad360 Is Being Built to Address' },
            { type: 'paragraph', text: 'Quad360 is a financial intelligence platform designed to help SMEs turn their financial data into practical insights around business performance, revenue, profitability, cash flow, financial health, capital requirements, financing readiness, and investment readiness.' },
            { type: 'paragraph', text: 'The objective is not simply to help a business record what happened. It is to help the business understand what the numbers mean and what it should do next — following a journey from Understand to Assess to Improve to Become Capital-Ready to Discover Capital to Engage.' },
            { type: 'paragraph', text: 'For SMEs, that means developing greater financial visibility before approaching a capital provider. For capital providers, it creates the possibility of engaging with businesses that have already taken steps toward becoming more financially prepared. For the wider financing ecosystem, it points toward a model in which financial intelligence becomes part of the infrastructure connecting businesses with capital.' },

            { type: 'heading', text: 'The Real Opportunity for West Africa' },
            { type: 'paragraph', text: "EBID's increased focus on SMEs matters for another reason: it highlights that the African financing ecosystem is evolving. Development finance institutions are putting capital behind private-sector growth. Financial institutions are being used to channel financing into local economies. SMEs are being recognised as critical engines of regional economic development. The question now is whether the infrastructure supporting that capital is evolving at the same pace — because more capital creates an opportunity, but without sufficient financial visibility and readiness, some of that opportunity can remain out of reach for the businesses it is intended to support." },
            { type: 'paragraph', text: 'Capital cannot finance what it cannot confidently understand. And businesses cannot effectively access capital if they cannot clearly explain their financial position.' },
            { type: 'paragraph', text: "Africa does not need to choose between more capital and better-prepared businesses. It needs an ecosystem that connects the two: more capital, better financial information, better-prepared SMEs, better-informed capital providers, and better capital allocation. If EBID's direction signals where institutional financing is heading, the opportunity ahead isn't simply to ask how we get more money into African SMEs — it's to ask how we make more African SMEs financially visible, financially healthy, and ready to receive that money." },

            { type: 'heading', text: 'The Next Frontier of SME Finance' },
            { type: 'paragraph', text: "The future of SME finance will not only be about moving more capital. It will be about making more businesses understandable, assessable, prepared, and financeable. EBID's increased focus on SMEs raises an important question for the entire West African financing ecosystem: as more capital becomes available, are we building the financial infrastructure needed to make that capital accessible to the businesses that need it most? That may be the next frontier of SME finance — and it is a question worth answering." },
            { type: 'paragraph', text: 'Quad360 is built to help answer that question, one business at a time. Try the demo to see how it turns your financial data into a clearer picture of where you stand — and what it would take to become capital-ready.' },
        ],
    },
];
