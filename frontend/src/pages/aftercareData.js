/**
 * Aftercare content data — 5 full blog-style topics per service category
 * Content sourced from maskpro.ph/blog + original MaskPro-branded content
 */

export const AFTERCARE_DATA = {
  coating: {
    title: 'Nano Ceramic Coating',
    subtitle: 'Post-Service Care Guide',
    icon: '🛡️',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    serviceKeywords: ['Nano Ceramic Coating', 'MNCC', 'Ceramic', 'Nano Fix'],
    topics: [
      {
        id: 'maintenance',
        label: 'Maintenance',
        icon: '🧽',
        title: 'Why It\'s Important to Maintain Your Nano Ceramic Coated Car',
        sections: [
          {
            heading: 'Regular Washing Schedule',
            content: 'Be diligent in washing your car at least twice a week or whenever necessary. Dirt can build up on your car over time — whether it\'s kept under a car cover or a garage. When contaminants pass through the coating layers, they can damage the topmost coating layer which has the highest grade of hydrophobic effect. Once this layer is compromised, the car\'s surface may lose its hydrophobic property entirely.',
          },
          {
            heading: 'The Two-Bucket Wash Method',
            content: 'Use the Rinseless Wash or Two-Bucket Method. Dip a microfiber bone sponge in a bucket of water mixed with rinseless solution, and clean the surface one panel at a time. After application, wipe it off gently using a microfiber towel. A grit guard insert is recommended. For dirtier surfaces, use two buckets — one with water and solution for soaking the wash mitt, and a second with water and grit guard to clean the mitt. These methods are economical, save water, and are easy to do.',
          },
          {
            heading: 'Avoid Direct Sunlight Washing',
            content: 'Never wash your nano ceramic coated car under direct sunlight. The hydrophobic surface causes water and soap to slide off quickly. When the car is washed under the sun, the drying process accelerates and may cause soap residue to stick to the coating. The best time to wash is at daybreak or during sunset when temperatures are cooler.',
          },
          {
            heading: 'Free 6-Month Periodic Maintenance',
            content: 'At MaskPro, we provide our customers with free maintenance once every six months so long as the warranty is in effect. An additional layer of coating is applied to maintain the hydrophobic property of the surface. Take your car to a MaskPro outlet before the hydrophobic property wears off — this is included in your service package.',
          },
        ],
      },
      {
        id: 'tree-sap',
        label: 'Tree Sap Removal',
        icon: '🌳',
        title: 'How to Remove Tree Sap from Your Ceramic Coated Car',
        sections: [
          {
            heading: 'Why Tree Sap is Dangerous',
            content: 'When you park under trees for shade, tree sap can drip onto your car\'s surface. Tree sap is acidic and sticky — if left unattended, it can etch through the ceramic coating and damage the clear coat underneath. The longer it sits, the harder it becomes to remove without causing micro-scratches.',
          },
          {
            heading: 'The Warm Water Soak Method',
            content: 'Soak a clean microfiber towel in warm (not hot) water and place it over the sap for 2–3 minutes. The warmth softens the sap, making it easier to wipe away without scrubbing. Gently lift the towel and wipe in one direction — never in circular motions which can create swirl marks on the coating.',
          },
          {
            heading: 'Using Isopropyl Alcohol (IPA)',
            content: 'For stubborn sap, apply a small amount of isopropyl alcohol (70% dilution) onto a microfiber cloth and gently dab the affected area. IPA dissolves tree sap without damaging the ceramic coating. After removal, rinse the area with water and apply a ceramic-safe quick detailer to restore the hydrophobic layer.',
          },
          {
            heading: 'Prevention Tips',
            content: 'Avoid parking under sap-producing trees like pine, maple, and elm. If you must park under trees, use a car cover. Inspect your car daily during spring and summer when sap production peaks, and remove any sap within 24 hours to prevent etching.',
          },
        ],
      },
      {
        id: 'first-week',
        label: 'First 7 Days',
        icon: '📅',
        title: 'Critical First 7 Days After Nano Ceramic Coating Application',
        sections: [
          {
            heading: 'The Curing Window',
            content: 'The first 7 days after application are the most critical period for your nano ceramic coating. During this time, the coating is chemically bonding to your paint\'s clear coat at a molecular level. Any disruption during this curing window can permanently affect the coating\'s performance, durability, and hydrophobic properties.',
          },
          {
            heading: 'No Water Contact for 48 Hours',
            content: 'Do not let water touch your car for the first 48 hours. This means no washing, no driving in rain, and no parking where sprinklers can reach. Even morning dew can interfere with the curing process. If water accidentally contacts the surface, gently blot (don\'t wipe) with a clean microfiber towel immediately.',
          },
          {
            heading: 'Avoid Covered Parking (First 3 Days)',
            content: 'Keep your car in a well-ventilated area — not in a sealed garage. Air circulation helps the coating cure properly. A carport or covered parking with open sides is ideal. Sealed garages can trap moisture and chemical fumes that slow down the curing process.',
          },
          {
            heading: 'No Chemical Contact for 7 Days',
            content: 'Avoid any chemical contact for the full 7 days: no car wax, no polish, no quick detailers, no bird dropping removers, and no fuel spills. Bird droppings and insect splatter should be removed with plain water and a damp microfiber cloth only. After the 7-day curing period, your coating is ready for regular maintenance.',
          },
        ],
      },
      {
        id: 'contaminants',
        label: 'Contaminants',
        icon: '⚠️',
        title: 'Dealing with Contaminants on Ceramic Coated Surfaces',
        sections: [
          {
            heading: 'Bird Droppings — Act Fast',
            content: 'Bird droppings are highly acidic (pH 3.5–4.5) and can etch through ceramic coating within hours in hot weather. Remove them as soon as possible using a damp microfiber towel. Never scrape dried droppings — soak them first with warm water for 30 seconds, then wipe gently. Keep a spray bottle of water and a microfiber cloth in your car for emergencies.',
          },
          {
            heading: 'Industrial Fallout and Iron Particles',
            content: 'If you live near construction sites, railways, or industrial areas, iron particles can bond to your coating and appear as tiny orange/brown spots. Use a ceramic-safe iron remover spray — apply it, wait until it turns purple (indicating chemical reaction with iron), then rinse thoroughly. Do this monthly if you\'re in a high-fallout area.',
          },
          {
            heading: 'Water Spots and Mineral Deposits',
            content: 'Hard water from garden hoses or sprinklers can leave mineral deposits (water spots) that bond to the coating over time. Always dry your car immediately after washing using a drying towel or air blower. If water spots have already bonded, use a ceramic-safe water spot remover — never use vinegar directly on the coating.',
          },
          {
            heading: 'Road Salt and Summer Tar',
            content: 'Road salt (rainy season) and tar splashes need prompt attention. Rinse salt residue with clean water after every drive during rainy season. For tar, use a dedicated tar remover — apply it, wait 30 seconds for it to dissolve, then wipe with a microfiber cloth. Never use petrol or diesel as a tar remover on coated surfaces.',
          },
        ],
      },
      {
        id: 'products',
        label: 'Approved Products',
        icon: '✅',
        title: 'MaskPro-Recommended Products for Coated Vehicles',
        sections: [
          {
            heading: 'pH-Neutral Car Shampoo Only',
            content: 'Always use pH-neutral car shampoo (pH 6–8). Regular dishwashing soap, harsh detergents, and acidic cleaners will strip the ceramic coating over time. MaskPro recommends using car shampoos specifically formulated for ceramic-coated vehicles. A small amount goes a long way — use 1–2 capfuls per bucket.',
          },
          {
            heading: 'Microfiber Towels — Quality Matters',
            content: 'Use only high-quality microfiber towels (300–400 GSM for washing, 600+ GSM for drying). Never use old t-shirts, regular cotton towels, or chamois leather — these create micro-scratches that dull the coating\'s gloss over time. Wash your microfiber towels separately without fabric softener, and replace them every 3–6 months.',
          },
          {
            heading: 'Ceramic Boost Spray (Optional)',
            content: 'Between your 6-month MaskPro maintenance appointments, you can use a SiO2 ceramic boost spray as a quick top-up. Apply after washing — spray onto a damp surface and wipe with a clean microfiber towel. This adds a temporary hydrophobic layer and enhances gloss. However, this does not replace your scheduled MaskPro maintenance.',
          },
          {
            heading: 'What NOT to Use',
            content: 'Never use: abrasive compounds or polishes, automatic car wash machines, pressure washer nozzle closer than 30cm, all-purpose cleaners (APC) at full strength, wax or sealants (they sit on top of the coating and reduce hydrophobicity), or Magic Eraser/melamine sponges. These products can damage or degrade your ceramic coating permanently.',
          },
        ],
      },
    ],
  },

  tint: {
    title: 'Nano Ceramic Tint',
    subtitle: 'Window Film Aftercare Guide',
    icon: '☀️',
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    serviceKeywords: ['Nano Ceramic Tint', 'Tint', 'Window', 'NCT'],
    topics: [
      {
        id: 'curing',
        label: 'Curing Period',
        icon: '⏱️',
        title: 'Understanding the Tint Curing Process',
        sections: [
          { heading: 'The 30-Day Curing Window', content: 'After tint installation, a 30-day curing period is essential. During this time, the adhesive between the film and glass is drying and bonding. You may notice small water bubbles, hazy patches, or a slightly cloudy appearance — this is completely normal and will disappear as the film cures. Do not attempt to pop bubbles or peel the film.' },
          { heading: 'Don\'t Roll Down Windows (5 Days)', content: 'Keep your windows fully closed for the first 5 days. Rolling them down can shift the film before the adhesive has fully bonded, causing peeling, creasing, or misalignment at the edges. After 5 days, you can roll them down gradually.' },
          { heading: 'Temperature and Season', content: 'Curing time varies with temperature: summer (15–20 days), rainy season (25–40 days). Park in sunlight during the day to accelerate curing. Avoid parking in completely dark garages for extended periods during the curing window, as UV light helps the adhesive cure faster.' },
          { heading: 'When to Be Concerned', content: 'If bubbles persist after 30 days, or if the film shows purple discoloration, peeling edges, or delamination, contact your MaskPro installer. These issues are covered under your tint warranty. MaskPro nano ceramic tint comes with a lifetime warranty against fading, bubbling, and peeling under normal conditions.' },
        ],
      },
      {
        id: 'cleaning',
        label: 'Cleaning Guide',
        icon: '🧹',
        title: 'How to Clean Tinted Windows Without Damage',
        sections: [
          { heading: 'Ammonia-Free Cleaners Only', content: 'Never use ammonia-based glass cleaners (like Windex) on tinted windows. Ammonia breaks down the tint film over time, causing purple discoloration and bubbling. Use only ammonia-free glass cleaners or a mixture of distilled water with a few drops of baby shampoo.' },
          { heading: 'Soft Cloth or Rubber Squeegee', content: 'Clean tinted windows with a soft microfiber cloth or a rubber squeegee. Never use paper towels, newspapers, or abrasive pads — these can scratch the film surface. Wipe in a top-to-bottom motion rather than circular patterns to avoid streaking.' },
          { heading: 'Interior vs Exterior Cleaning', content: 'The tint film is on the inside of your windows. Be gentle when cleaning the interior glass surface. You can use regular glass cleaner on the exterior side since there\'s no film there. When cleaning the interior, spray the cleaner onto the cloth (not directly onto the glass) to prevent liquid from seeping under the film edges.' },
          { heading: 'Frequency', content: 'Clean your tinted windows once every two weeks for optimal clarity. In dusty environments or during pollen season, increase to once a week. Regular cleaning prevents dirt buildup that can scratch the film surface when you eventually do clean it.' },
        ],
      },
      {
        id: 'protection',
        label: 'Film Protection',
        icon: '🔒',
        title: 'Protecting Your Tint Investment',
        sections: [
          { heading: 'Seatbelt Buckle Damage', content: 'One of the most common causes of tint damage is seatbelt buckles hitting the rear window when passengers exit the vehicle. Train passengers to hold the buckle when removing their seatbelt. Consider using seatbelt buckle covers for added protection. A single impact from a metal buckle can crack or chip the tint film permanently.' },
          { heading: 'Sticker and Suction Cup Placement', content: 'Avoid placing stickers, suction cup mounts (for GPS or phone), or any adhesive directly on tinted surfaces. Removing stickers can peel the tint film. Use dashboard mounts instead of windshield suction cups. If you must place something on the glass, use the windshield which typically has a different, more durable film.' },
          { heading: 'Cargo and Sharp Objects', content: 'When loading cargo, keep sharp objects away from rear and side windows. Metal edges, umbrella tips, and sports equipment can scratch or puncture the tint film. Use the trunk/boot for cargo and maintain a clear zone around all tinted windows when loading and unloading.' },
          { heading: 'Pet Safety', content: 'Pets\' claws can easily scratch and damage tint film. If you travel with pets, keep them away from windows using pet barriers or carriers. Dogs who like to press their noses against windows may not damage the film, but their claws can leave permanent scratches when they paw at the glass.' },
        ],
      },
      {
        id: 'heat-rejection',
        label: 'Heat Benefits',
        icon: '🌡️',
        title: 'Maximizing Heat Rejection Performance',
        sections: [
          { heading: 'How Nano Ceramic Tint Works', content: 'MaskPro Nano Ceramic Tint uses nano-ceramic particles that block up to 99% of UV rays and reject up to 80% of infrared heat. Unlike metallic tints, nano ceramic tint doesn\'t interfere with GPS, radio, Bluetooth, or electronic toll systems. The ceramic particles are embedded in the film and won\'t degrade over time.' },
          { heading: 'Use Sunshades in Combination', content: 'For maximum heat rejection, combine your nano ceramic tint with a reflective windshield sunshade when parked. While the tint handles most heat from side and rear windows, the windshield (which may have a lighter tint) benefits from additional protection. This keeps your cabin 10–15°C cooler.' },
          { heading: 'Air Conditioning Efficiency', content: 'With nano ceramic tint properly installed, your air conditioning works more efficiently — it doesn\'t have to fight heat as much, reducing fuel consumption by up to 5–8%. Start your AC on low after entering a tinted car; you\'ll notice it cools down 40% faster than a non-tinted vehicle.' },
          { heading: 'UV Protection for Interior', content: 'UV rays cause dashboard cracking, leather fading, and upholstery discoloration. With 99% UV rejection, your nano ceramic tint acts as sunscreen for your entire car interior. This preserves your vehicle\'s resale value by keeping leather, plastic, and fabric looking new for years longer.' },
        ],
      },
      {
        id: 'warranty',
        label: 'Warranty Info',
        icon: '📋',
        title: 'Understanding Your MaskPro Tint Warranty',
        sections: [
          { heading: 'Lifetime Warranty Coverage', content: 'MaskPro Nano Ceramic Tint comes with a lifetime warranty covering: bubbling, peeling, cracking, delamination, and color change/fading. The warranty is valid for as long as you own the vehicle. Keep your certificate of installation and receipt — these are your proof of warranty.' },
          { heading: 'What Voids the Warranty', content: 'The warranty is voided by: use of ammonia-based cleaners, physical damage from scratches or impacts, unauthorized removal and reinstallation, modifications to the film, and commercial vehicle use (separate commercial warranty applies). Normal wear from window operation is covered.' },
          { heading: 'How to File a Warranty Claim', content: 'If you notice any warranty-covered issues, visit any MaskPro branch with your installation certificate. Our team will inspect the film and process your claim. Warranty claims are typically resolved within 3–5 business days, including removal of old film and installation of new film at no charge.' },
          { heading: 'Transferability', content: 'Your tint warranty is non-transferable. If you sell your vehicle, the warranty does not pass to the new owner. However, the new owner can purchase a new warranty extension through any MaskPro branch. This is another reason to keep your installation documents in a safe place.' },
        ],
      },
    ],
  },

  ppf: {
    title: 'Paint Protection Film',
    subtitle: 'PPF Maintenance Guide',
    icon: '🔥',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    serviceKeywords: ['PPF', 'Paint Protection Film', 'Protection Film'],
    topics: [
      {
        id: 'initial-care',
        label: 'First 48 Hours',
        icon: '⏳',
        title: 'Critical First 48 Hours After PPF Installation',
        sections: [
          { heading: 'No Washing for 48 Hours', content: 'The adhesive needs 48 hours to fully bond to your paint. Do not wash, wipe, or let water sit on the film during this period. If the car gets wet from unexpected rain, gently blot the water with a clean microfiber towel — do not rub or drag across the film surface.' },
          { heading: 'Avoid High-Pressure Water', content: 'For the first 7 days, avoid high-pressure washers, especially near the edges of the film. High-pressure water can lift film edges before the adhesive has fully cured. After 7 days, you can use pressure washers but maintain at least 30cm distance from film edges.' },
          { heading: 'Edge Lifting — Don\'t Panic', content: 'Minor edge lifting in the first 48 hours is normal as the adhesive settles. Do not press down or try to fix it yourself — this can trap air bubbles. If edges haven\'t settled after 48 hours, contact your MaskPro installer for a quick re-wrap of the affected edge.' },
          { heading: 'Temperature Sensitivity', content: 'Avoid extreme temperature changes in the first 48 hours. Don\'t park directly in scorching sun or blast the AC to maximum with cold air hitting the film. Gradual temperature changes are fine. After the curing period, PPF performs well in all Philippine weather conditions.' },
        ],
      },
      {
        id: 'washing',
        label: 'Washing PPF',
        icon: '💧',
        title: 'How to Properly Wash Paint Protection Film',
        sections: [
          { heading: 'Hand Wash Only Recommended', content: 'Hand washing is the safest method for PPF-covered vehicles. Use pH-neutral car shampoo, a soft wash mitt, and the two-bucket method. Avoid automated car washes — the spinning brushes can scratch, lift edges, or peel the film. Touchless car washes are acceptable but less ideal than hand washing.' },
          { heading: 'Top-Down Washing Technique', content: 'Always wash from top to bottom to prevent dirt from upper panels dragging across clean lower panels. Rinse thoroughly before touching the surface with a mitt. Pre-soak heavily soiled areas with soapy water for 2–3 minutes before wiping. This is especially important for PPF because trapped grit can scratch the film.' },
          { heading: 'Drying Without Scratches', content: 'Use a premium drying towel (600+ GSM) or an air blower. Pat dry rather than drag-drying. Pay special attention to drying film edges where water can pool and seep underneath. A leaf blower on low setting is excellent for drying around PPF edges and complex curves.' },
          { heading: 'Bug and Tar Removal', content: 'Remove bugs and tar within 24 hours to prevent staining. Use a dedicated bug and tar remover spray — apply, wait 30 seconds, and wipe gently. Never scrape bugs off PPF with your fingernail or a credit card. For dried bugs, soak with a warm wet microfiber towel for 2 minutes first.' },
        ],
      },
      {
        id: 'self-healing',
        label: 'Self-Healing',
        icon: '✨',
        title: 'Understanding PPF\'s Self-Healing Technology',
        sections: [
          { heading: 'How Self-Healing Works', content: 'MaskPro PPF features a thermoplastic polyurethane top coat that has self-healing properties. When the film sustains light scratches or swirl marks, applying heat causes the polymer chains to realign and fill in the scratch. This \"memory\" effect makes the scratch disappear as the surface returns to its original smooth state.' },
          { heading: 'Heat Activation Methods', content: 'Self-healing activates at temperatures above 60°C. Methods include: pouring warm water (not boiling) over the scratch, parking in direct sunlight for 15–30 minutes, or using a heat gun on low setting from 30cm away. Philippine sun exposure is usually sufficient — park your car in sunlight for 20 minutes after noticing scratches.' },
          { heading: 'What Self-Healing Can\'t Fix', content: 'Self-healing only works on surface scratches in the film\'s top coat. Deep cuts that penetrate through the film, tears from impacts, chemical etching from bird droppings left too long, and punctures from sharp objects are beyond the self-healing capability. These require professional repair or panel re-wrap.' },
          { heading: 'Maintaining Self-Healing Performance', content: 'Over time (3–5 years), the self-healing property diminishes as the top coat wears. Regular maintenance keeps it performing longer — avoid harsh chemicals, abrasive towels, and automatic car washes. Applying a PPF-specific sealant every 6 months can extend the self-healing life of your film.' },
        ],
      },
      {
        id: 'yellowing',
        label: 'Anti-Yellowing',
        icon: '🟡',
        title: 'Preventing and Understanding PPF Yellowing',
        sections: [
          { heading: 'Why Some PPF Yellows', content: 'Inferior PPF products use adhesives and polyurethane that break down under UV exposure, causing yellowing within 1–2 years. MaskPro PPF uses UV-stabilized materials with anti-yellowing technology that resists discoloration for the full warranty period. Our film maintains optical clarity throughout its lifespan.' },
          { heading: 'Environmental Factors', content: 'Even premium PPF can yellow faster if exposed to: heavy pollution, industrial fallout, consistent high-heat parking, and chemical contaminants. If your vehicle is regularly parked near factories, construction sites, or in areas with heavy smog, increase your washing frequency and consider more frequent professional maintenance.' },
          { heading: 'Maintaining Clarity', content: 'Keep the film clean, remove contaminants promptly, and avoid parking in extreme heat when possible. Apply a PPF-safe ceramic coating on top of the film (after the 7-day curing period) for added UV protection and easier maintenance. This dual-layer approach — PPF + ceramic coating — provides the ultimate paint protection.' },
          { heading: 'Warranty on Yellowing', content: 'MaskPro PPF includes a warranty against yellowing. If your film shows visible yellowing within the warranty period under normal use conditions, bring your vehicle to any MaskPro branch. Our team will assess the film and replace affected panels at no additional cost.' },
        ],
      },
      {
        id: 'long-term',
        label: 'Long-Term Care',
        icon: '📆',
        title: 'Long-Term PPF Maintenance Schedule',
        sections: [
          { heading: 'Weekly: Visual Inspection', content: 'Walk around your car weekly and visually inspect the PPF edges, especially on high-impact areas like the hood, bumper, fenders, and side mirrors. Look for edge lifting, bubbles, yellowing, or damage. Early detection of issues means simpler repairs. Report any concerns to MaskPro during your next maintenance visit.' },
          { heading: 'Monthly: Deep Clean', content: 'Once a month, do a thorough decontamination wash. Use a clay bar or chemical decontamination spray (PPF-safe) to remove embedded contaminants. Follow with a PPF-specific sealant to maintain the hydrophobic surface. This monthly routine keeps your film looking factory-fresh and extends its lifespan significantly.' },
          { heading: 'Every 6 Months: Professional Check', content: 'Visit MaskPro every 6 months for a professional PPF inspection. Our technicians will check adhesion, inspect for micro-damage, clean edges, and re-wrap any lifted sections. This is included in your maintenance package and ensures your film continues to protect your paint effectively.' },
          { heading: 'Year 3+: Assessment for Re-wrap', content: 'After 3 years, the film may start showing signs of wear on high-impact areas. During your professional check, discuss with your MaskPro technician whether specific panels need re-wrapping. Replacing individual panels is cost-effective and maintains full-body protection without replacing the entire film.' },
        ],
      },
    ],
  },

  'paint-repair': {
    title: 'Auto Paint & Repair',
    subtitle: 'Post-Repair Care Guide',
    icon: '🖌️',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    serviceKeywords: ['Auto Paint', 'Paint', 'Repair', 'Repaint', 'Body'],
    topics: [
      {
        id: 'post-paint',
        label: 'After Repaint',
        icon: '🎨',
        title: 'Essential Care After Your Vehicle is Repainted',
        sections: [
          { heading: 'The 30-Day Curing Rule', content: 'Fresh automotive paint takes approximately 30 days to fully cure and harden, even though it feels dry to the touch within hours. During this curing period, solvents in the paint are evaporating and the molecular structure is solidifying. Disrupting this process can lead to permanent damage including soft spots, trapped moisture, and premature paint failure.' },
          { heading: 'No Wax or Polish for 90 Days', content: 'Do not apply any wax, polish, sealant, or ceramic coating for at least 90 days after a repaint. These products seal the surface and can trap solvents that need to escape during the curing process. Trapped solvents cause clouding, bubbling, and adhesion failure. After 90 days, start with a gentle polish before applying any protective coating.' },
          { heading: 'Gentle Hand Wash Only', content: 'For the first 30 days, wash only by hand using a pH-neutral soap and a soft microfiber wash mitt. Do not use automated car washes, pressure washers, or any chemical cleaning products. Rinse with low-pressure water and pat dry with a soft drying towel. Avoid wiping bugs or bird droppings aggressively — soak them first.' },
          { heading: 'Avoid Direct Sun Parking', content: 'For the first 2 weeks after a repaint, minimize prolonged direct sun exposure. While some UV exposure helps curing, extreme heat (in open parking lots during midday) can cause the paint to cure unevenly. Use covered parking when possible. After the 30-day curing period, normal parking habits can resume.' },
        ],
      },
      {
        id: 'scratch-fix',
        label: 'Scratch Prevention',
        icon: '🔍',
        title: 'How to Prevent and Handle Paint Scratches',
        sections: [
          { heading: 'The 3-Types of Scratches', content: 'Surface scratches (clear coat only) are the most common and easiest to fix. They appear as light marks visible in direct light. Medium scratches reach the paint layer and show as white lines. Deep scratches expose the primer or bare metal and require professional repair. Understanding which type you have determines the correct fix.' },
          { heading: 'Daily Prevention Habits', content: 'Park with a gap from adjacent cars. Be aware of shopping cart zones. Avoid parking under trees where branches may sway. Use a car cover when parked for extended periods. When entering/exiting, open doors carefully. These simple habits prevent 80% of the scratches that vehicles typically accumulate.' },
          { heading: 'Washing-Related Scratches', content: 'The majority of paint scratches come from improper washing: using dirty towels, circular wiping motions, insufficient lubrication, and automatic car washes. Always use the two-bucket method, wash in straight lines (not circles), use a grit guard, and rinse your mitt frequently. A proper wash technique is your paint\'s best defense.' },
          { heading: 'When to Come Back to MaskPro', content: 'For any scratch that catches your fingernail, visit MaskPro for professional assessment. Our technicians can perform spot corrections, wet sanding, or localized repainting depending on severity. Minor clear coat scratches can often be polished out in a single visit, keeping your paint looking showroom-new.' },
        ],
      },
      {
        id: 'color-matching',
        label: 'Color Matching',
        icon: '🎯',
        title: 'Understanding Professional Color Matching',
        sections: [
          { heading: 'How MaskPro Matches Your Paint', content: 'MaskPro uses spectrophotometer technology to analyze your vehicle\'s exact paint color. This device reads the color at a microscopic level, accounting for fading, sun exposure, and manufacturer variations. Our computerized mixing system then creates a formula that matches your car\'s current color — not just the factory color code.' },
          { heading: 'Why Factory Color Codes Aren\'t Enough', content: 'Your car\'s paint changes from the day it leaves the factory. UV exposure, washing, environmental factors, and aging cause the color to shift. Using only the factory color code can result in a visible mismatch between new and old paint. Professional spectrophotometer matching ensures a seamless, invisible repair.' },
          { heading: 'Blending for Invisible Repairs', content: 'For panel repairs, MaskPro uses a blending technique: the exact repair area gets full paint coverage, and the surrounding panels receive a graduated blend coat. This creates a smooth color transition that makes the repair completely invisible, even under close inspection. Blending is included in all our paint repair services.' },
          { heading: 'Post-Repair Color Consistency', content: 'After repair, the new paint may appear slightly different in the first few weeks due to curing. As the fresh paint cures and the clear coat hardens, the color will settle and match the surrounding panels more closely. If you notice a color mismatch after 30 days of curing, visit your MaskPro branch for a free reassessment.' },
        ],
      },
      {
        id: 'rust-prevention',
        label: 'Rust Prevention',
        icon: '🛡️',
        title: 'Rust Prevention After Paint Repair',
        sections: [
          { heading: 'Why Repaired Areas Are Vulnerable', content: 'Any area where paint has been repaired or the original factory paint disturbed is more susceptible to rust. The factory applies paint through an electrocoat (e-coat) process that provides superior adhesion and corrosion resistance. Aftermarket repairs, while professional, can\'t fully replicate this factory-level bonding, making repaired areas the first places rust can start.' },
          { heading: 'Inspect Repaired Panels Monthly', content: 'Check all previously repaired panels monthly for any signs of bubbling, peeling, or orange discoloration visible through the paint. These are early signs of rust forming underneath the paint surface. Catching rust early means a simple touch-up fix; ignoring it means the rust spreads under the healthy paint and requires a much larger repair.' },
          { heading: 'Ceramic Coat After Curing', content: 'After the 90-day paint curing period, applying a MaskPro Nano Ceramic Coating over repaired panels adds an extra layer of corrosion protection. The ceramic coating seals the paint surface and prevents moisture, salt, and contaminants from reaching vulnerable repaired areas. This is the best investment you can make for repaired panels.' },
          { heading: 'Chip Repair — Don\'t Wait', content: 'If your repaired panel gets a new stone chip or scratch, don\'t wait. Exposed bare metal begins rusting within 24–48 hours in humid Philippine conditions. Apply touch-up paint or clear nail polish as a temporary seal and visit MaskPro as soon as possible for a proper repair. Prevention is always cheaper than cure.' },
        ],
      },
      {
        id: 'insurance-claims',
        label: 'Insurance Tips',
        icon: '📄',
        title: 'Navigating Insurance Claims for Paint Repair',
        sections: [
          { heading: 'Document Everything', content: 'Before bringing your car for repair, photograph all damage from multiple angles, in good lighting. Include wide shots showing the damage location on the vehicle and close-ups of the actual damage. Note the date, time, and circumstances of how the damage occurred. These records are crucial for smooth insurance claim processing.' },
          { heading: 'Get a Professional Assessment First', content: 'Visit MaskPro for a professional damage assessment and repair estimate before filing your insurance claim. Our detailed inspection report includes exact panel locations, damage severity, required procedures, and itemized costs. Insurance companies process claims faster when supported by professional documentation from a reputable shop.' },
          { heading: 'MaskPro\'s Insurance-Friendly Process', content: 'MaskPro works directly with major Philippine insurance providers. We can provide the required documentation, photographs, and estimates in the format your insurer needs. In many cases, our team can handle the claim filing process on your behalf, reducing your paperwork and getting your repair approved faster.' },
          { heading: 'Choosing Quality Over Speed', content: 'Insurance companies may suggest their accredited shops for faster processing. However, you have the right to choose your repair shop. MaskPro uses premium materials (OEM-grade paint, manufacturer-approved clear coats) and proper curing times. A quality repair at MaskPro protects your vehicle\'s value better than a rushed job at a generic body shop.' },
        ],
      },
    ],
  },

  detailing: {
    title: 'Detailing',
    subtitle: 'Post-Detail Maintenance',
    icon: '✨',
    gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    serviceKeywords: ['Detailing', 'Detail', 'Interior', 'Exterior', 'Full Detail'],
    topics: [
      {
        id: 'wash-routine',
        label: 'Wash Routine',
        icon: '🧼',
        title: 'Maintaining Your Detail with Proper Wash Routine',
        sections: [
          { heading: 'The Two-Week Rule', content: 'After a professional detail, maintain the results by washing your car every two weeks at minimum. Your detail included paint correction, polish, and protection — regular washing preserves these results. Go longer than two weeks and contaminants start bonding to the surface, undoing the work done during detailing.' },
          { heading: 'Pre-Wash Rinse is Essential', content: 'Always start with a thorough pre-wash rinse. Use a garden hose or low-pressure rinse to remove loose dirt, sand, and debris from the surface BEFORE touching it with a wash mitt. Skipping this step means your wash mitt drags abrasive particles across the paint, creating the very scratches your detail was meant to remove.' },
          { heading: 'pH-Neutral Soap — Always', content: 'Use pH-neutral car shampoo for every wash. Harsh soaps, dishwashing liquid, and acidic cleaners strip the protective wax or sealant applied during your detail. A quality pH-neutral shampoo cleans effectively while leaving the protective layer intact. One capful per bucket is sufficient — more soap doesn\'t mean more clean.' },
          { heading: 'Dry Properly — No Air-Drying', content: 'Never let your car air-dry after washing. Water left on the surface creates mineral deposits (water spots) that bond to the paint and can etch through your protective layer. Use a quality drying towel (600+ GSM microfiber) or an air blower. Start from the top and work down, using a patting motion rather than dragging.' },
        ],
      },
      {
        id: 'interior',
        label: 'Interior Care',
        icon: '🚗',
        title: 'Keeping Your Interior Showroom-Clean',
        sections: [
          { heading: 'Weekly Vacuum Schedule', content: 'Vacuum your interior weekly, focusing on seats, floor mats, between seats, and door pockets. Your detail included deep extraction and cleaning — maintain this by preventing dirt accumulation. Use a crevice tool for between-seat gaps where coins, crumbs, and dust collect. Remove floor mats and vacuum underneath monthly.' },
          { heading: 'Leather Conditioning (Monthly)', content: 'If your vehicle has leather seats, apply a quality leather conditioner once a month. Your detail included deep leather cleaning and conditioning — monthly follow-up keeps the leather supple and prevents cracking. Apply with a foam applicator in thin coats, let it absorb for 10 minutes, then buff with a soft cloth. Focus on high-wear areas like bolsters and armrests.' },
          { heading: 'Dashboard and Plastics', content: 'Use a UV-protectant on dashboard, door panels, and plastic trim monthly. The Philippine sun is intense and causes plastic to fade, crack, and become brittle. A quality UV-protectant with matte finish protects against UV damage without leaving a greasy or shiny appearance. Avoid silicone-based products that attract dust.' },
          { heading: 'Odor Prevention', content: 'Your detail likely included odor elimination treatment. Maintain a fresh interior by: never eating in the car, removing garbage daily, keeping windows cracked slightly when parked in shade for ventilation, and using a charcoal-based air purifier rather than chemical air fresheners. Charcoal absorbs odors naturally without masking them.' },
        ],
      },
      {
        id: 'glass-care',
        label: 'Glass & Mirrors',
        icon: '🪟',
        title: 'Crystal-Clear Glass Maintenance',
        sections: [
          { heading: 'Streak-Free Glass Cleaning', content: 'Clean your glass every wash using an ammonia-free glass cleaner and a dedicated glass-only microfiber towel (waffle weave is best). Clean the interior glass surface separately from exterior. Spray the cleaner onto the towel (not the glass) and wipe in straight lines. Finish with a dry towel for streak-free clarity.' },
          { heading: 'Windshield Water Repellent', content: 'Apply a glass water repellent (like Rain-X or similar) to your windshield every 3 months. This creates a hydrophobic barrier that makes rain bead up and roll off at highway speeds, dramatically improving visibility during heavy Philippine rainstorms. Apply after thorough glass cleaning for maximum bonding and longevity.' },
          { heading: 'Interior Glass Haze', content: 'If your interior windshield develops a hazy film, it\'s from off-gassing of plastic and vinyl components, especially in new cars or hot weather. Clean this film with a dedicated glass cleaner and waffle-weave microfiber towel. This haze reduces visibility, especially at night when oncoming headlights scatter through the film.' },
          { heading: 'Mirror Tips', content: 'Side mirrors and rearview mirrors should be cleaned with the same care as windows. Use a glass-specific microfiber towel — never paper towels or rags. For heated mirrors, avoid cleaning while the heating element is active. Clean mirrors at least twice a month for optimal visibility and safety, especially during rainy season.' },
        ],
      },
      {
        id: 'tire-wheel',
        label: 'Tires & Wheels',
        icon: '🛞',
        title: 'Tire and Wheel Maintenance After Detailing',
        sections: [
          { heading: 'Brake Dust — The Silent Killer', content: 'Brake dust is corrosive and bonds to wheel surfaces within days. Your detail included thorough wheel cleaning and protection — maintain this by cleaning wheels every wash. Use a dedicated wheel brush and pH-neutral wheel cleaner (not the same brush or soap as your body wash). Brake dust left untreated causes permanent pitting in alloy wheels.' },
          { heading: 'Tire Dressing Application', content: 'Apply tire dressing every 2 weeks or after every wash. Use a water-based tire dressing (not silicone-based) for a natural satin finish that doesn\'t sling onto your fenders at highway speed. Apply with a foam applicator pad in thin, even coats. Let it absorb for 5 minutes before driving. This protects against UV-induced tire browning.' },
          { heading: 'Wheel Sealant Protection', content: 'After your detail, your wheels may have been sealed with a wheel-specific sealant or ceramic coating. This makes brake dust easier to clean and prevents bonding. Reapply a wheel sealant every 3–6 months. The investment pays for itself in time saved during regular washes — sealed wheels can be cleaned in seconds with just water.' },
          { heading: 'Tire Sidewall Care', content: 'Inspect tire sidewalls monthly for cracking, bulging, or unusual wear. The Philippine heat accelerates tire degradation. UV exposure causes sidewall rubber to dry out and crack. Regular tire dressing application protects against UV damage and keeps rubber flexible. Replace tires showing any signs of sidewall cracking — this is a safety issue.' },
        ],
      },
      {
        id: 'seasonal',
        label: 'Seasonal Care',
        icon: '🌦️',
        title: 'Seasonal Car Care in the Philippines',
        sections: [
          { heading: 'Summer (March–May): UV Protection Priority', content: 'The Philippine summer means intense UV exposure that fades paint, cracks dashboards, and degrades rubber. Park in shade when possible. Apply UV-protectant to all interior surfaces monthly. Consider a ceramic coating or wax top-up for added paint protection. Use a windshield sunshade when parked — your interior can reach 70°C in direct summer sun.' },
          { heading: 'Rainy Season (June–November): Water Protection', content: 'Heavy rain brings contaminants, road debris, and flooding risks. Wash your car more frequently during rainy season to remove acidic rain residue. Check drain channels in door frames and sunroof tracks for blockages. Apply fresh water-repellent to your windshield. Inspect for moisture intrusion in the trunk and under floor mats after heavy rains.' },
          { heading: 'Post-Flood Emergency Care', content: 'If your car goes through flood water (even shallow), wash the undercarriage and wheel wells thoroughly within 24 hours. Flood water contains sewage, chemicals, and debris that accelerate rust. Check and clean brake components. Inspect the interior for water intrusion — damp carpet under floor mats is a mold breeding ground. Air out the car with windows open.' },
          { heading: 'Year-Round: Monthly Walk-Around', content: 'Once a month, do a thorough visual inspection of your entire vehicle: check for new scratches, stone chips, paint swelling (early rust sign), rubber seal deterioration, and trim condition. This 10-minute routine catches problems early when they\'re cheap to fix. Your MaskPro detail gave your car a fresh start — monthly inspections keep it that way.' },
        ],
      },
    ],
  },
};
