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

  const svg = `
<svg width="700" height="200" viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="698" height="198" rx="14" fill="#0d1117" stroke="#e6edf3" stroke-width="1.2" stroke-opacity="0.6"/>

  <!-- Total Contributions -->
  <text x="175" y="78" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="34" font-weight="700" fill="#5b9bf8">${totalContributions}</text>
  <text x="175" y="106" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="14" fill="#5b9bf8">Total Contributions</text>
  <text x="175" y="128" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="11.5" fill="#56d364">${fmt(firstDay)} - Present</text>

  <line x1="290" y1="35" x2="290" y2="165" stroke="#e6edf3" stroke-width="1" stroke-opacity="0.25"/>
  <line x1="410" y1="35" x2="410" y2="165" stroke="#e6edf3" stroke-width="1" stroke-opacity="0.25"/>

  <!-- Current Streak ring + flame -->
  <circle cx="350" cy="72" r="40" fill="none" stroke="#58a6ff" stroke-width="4"
    stroke-dasharray="219 251" stroke-dashoffset="-165" stroke-linecap="round" transform="rotate(0 350 72)"/>
  <path d="M350 32 c -3 6 -8 9 -8 15 c 0 5 4 8 8 8 c 4 0 8 -3 8 -8 c 0 -4 -2 -6 -3 -9 c 0 3 -1 5 -2 6 c 0 -4 -1 -8 -3 -12 z"
    fill="#0d1117" stroke="#58a6ff" stroke-width="2" stroke-linejoin="round"/>
  <text x="350" y="82" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="28" font-weight="700" fill="#c297ff">${currentStreak}</text>
  <text x="350" y="130" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="14" font-weight="700" fill="#c297ff">Current Streak</text>
  <text x="350" y="150" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="11.5" fill="#56d364">${fmt(currentStreakStart)} - ${fmt(todayStr)}</text>

  <!-- Longest Streak -->
  <text x="525" y="78" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="34" font-weight="700" fill="#5b9bf8">${longestStreak}</text>
  <text x="525" y="106" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="14" fill="#5b9bf8">Longest Streak</text>
  <text x="525" y="128" text-anchor="middle" font-family="'Segoe UI', Verdana, sans-serif" font-size="11.5" fill="#56d364">${fmt(longestStreakRange[0])} - ${fmt(longestStreakRange[1])}</text>
</svg>
`.trim();

  fs.mkdirSync(path.join(__dirname, "..", "dist"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "dist", "live-stats.svg"), svg);
  console.log("live-stats.svg generated.");
}

main();
