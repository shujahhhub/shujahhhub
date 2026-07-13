// Fetches real, live contribution data straight from GitHub's GraphQL API
// (no third-party caching layer) and renders a stats SVG.

const fs = require("fs");
const path = require("path");

const GH_TOKEN = process.env.GH_TOKEN;
const GH_USERNAME = process.env.GH_USERNAME;

if (!GH_TOKEN) {
  console.error("Missing GH_TOKEN (add a PROFILE_TOKEN secret in repo settings).");
  process.exit(1);
}

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${GH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: GH_USERNAME } }),
  });

  const json = await res.json();

  if (json.errors) {
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const calendar = json.data.user.contributionsCollection.contributionCalendar;
  const totalContributions = calendar.totalContributions;

  // Flatten all days into a single chronological array
  const days = calendar.weeks.flatMap((w) => w.contributionDays);

  // --- Current streak: walk backward from the most recent day ---
  let currentStreak = 0;
  let currentStreakStart = null;
  const todayStr = new Date().toISOString().split("T")[0];

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date > todayStr) continue; // skip any future placeholder days
    if (day.contributionCount > 0) {
      currentStreak++;
      currentStreakStart = day.date;
    } else {
      // allow today to be zero (streak not broken until the day ends)
      if (day.date === todayStr) continue;
      break;
    }
  }

  // --- Longest streak: scan the whole year for the longest run ---
  let longestStreak = 0;
  let longestStreakRange = ["", ""];
  let run = 0;
  let runStart = null;

  for (const day of days) {
    if (day.contributionCount > 0) {
      if (run === 0) runStart = day.date;
      run++;
      if (run > longestStreak) {
        longestStreak = run;
        longestStreakRange = [runStart, day.date];
      }
    } else {
      run = 0;
    }
  }

  const fmt = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

  const firstDay = days.find((d) => d.contributionCount > 0)?.date || days[0]?.date;

  const svg = `<svg width="700" height="210" viewBox="0 0 700 210" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00fff0"/>
      <stop offset="50%" stop-color="#ff00e5"/>
      <stop offset="100%" stop-color="#00fff0"/>
    </linearGradient>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1a2a3a" stroke-width="0.6"/>
    </pattern>
  </defs>

  <rect x="1" y="1" width="698" height="208" rx="10" fill="#03050d"/>
  <rect x="1" y="1" width="698" height="208" rx="10" fill="url(#grid)"/>
  <rect x="1.5" y="1.5" width="697" height="207" rx="10" fill="none" stroke="url(#borderGrad)" stroke-width="2" filter="url(#glowSoft)"/>

  <!-- Total Contributions -->
  <text x="175" y="82" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="36" font-weight="800" fill="#00fff0" filter="url(#glow)">${totalContributions}</text>
  <text x="175" y="112" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="13" letter-spacing="1.5" fill="#5be9ff">TOTAL CONTRIBUTIONS</text>
  <text x="175" y="135" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="11" fill="#39ff8f">${fmt(firstDay)} - Present</text>

  <!-- Current Streak -->
  <circle cx="350" cy="76" r="42" fill="none" stroke="#ff00e5" stroke-width="3.5" filter="url(#glow)"/>
  <text x="350" y="87" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="30" font-weight="800" fill="#ff5df0" filter="url(#glow)">${currentStreak}</text>
  <text x="350" y="140" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="13" font-weight="700" letter-spacing="1.5" fill="#ff5df0">CURRENT STREAK</text>
  <text x="350" y="160" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="11" fill="#39ff8f">${fmt(currentStreakStart)} - ${fmt(todayStr)}</text>

  <!-- Longest Streak -->
  <text x="525" y="82" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="36" font-weight="800" fill="#00fff0" filter="url(#glow)">${longestStreak}</text>
  <text x="525" y="112" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="13" letter-spacing="1.5" fill="#5be9ff">LONGEST STREAK</text>
  <text x="525" y="135" text-anchor="middle" font-family="'Consolas', 'Courier New', monospace" font-size="11" fill="#39ff8f">${fmt(longestStreakRange[0])} - ${fmt(longestStreakRange[1])}</text>
</svg>`;

  fs.mkdirSync(path.join(__dirname, "..", "dist"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "dist", "live-stats.svg"), svg);
  console.log("live-stats.svg generated.");
}

main();
