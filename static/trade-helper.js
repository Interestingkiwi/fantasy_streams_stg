(async function() {
    // A short delay to ensure the page elements are in the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    // --- Global Elements (Always present in trade-helper.html) ---
    const loadingText = document.getElementById('trade-helper-loading');
    const tradeFromSelect = document.getElementById('trade-from-select');
    const tradeToSelect = document.getElementById('trade-to-select');
    const yourTeamSelect = document.getElementById('your-team-select');
    const navPartners = document.getElementById('nav-partners');
    const navCompare = document.getElementById('nav-compare');
    const subpageContent = document.getElementById('subpage-content');

    // --- State Variables ---
    let currentSubPage = 'trade-partners'; // Default page
    let userTeamName = localStorage.getItem('selectedTeam') || '';

    // --- Data Store ---
    let categoryData = { skater_stats: [], goalie_stats: [] }; // For Trade Partners
    let rosterData = { players: [], skaterCategories: [], goalieCategories: [] }; // For Trade Compare

    // --- Heatmap Helper ---
    function getHeatmapColor(rank) {
        if (rank === null || rank === undefined || rank === '-' || isNaN(rank)) {
            return '';
        }
        const minRank = 1;
        const maxRank = 20;
        const clampedRank = Math.max(minRank, Math.min(rank, maxRank));
        const percentage = (clampedRank - minRank) / (maxRank - minRank);
        // Hue: 0 (red) to 120 (green)
        const hue = (1 - percentage) * 120;
        return `hsl(${hue}, 65%, 75%)`;
    }

    // --- Initialization ---
    async function init() {
        if (!tradeFromSelect || !tradeToSelect || !yourTeamSelect || !subpageContent) {
            console.error('Trade Helper: Critical elements missing.');
            return;
        }

        // 1. Attach Event Listeners to Global Controls
        yourTeamSelect.addEventListener('change', () => {
            userTeamName = yourTeamSelect.value; // Update local state
            // Re-fetch all data when team changes
            fetchAllData();
        });

        tradeFromSelect.addEventListener('change', renderCurrentPage);
        tradeToSelect.addEventListener('change', renderCurrentPage);

        // 2. Attach Navigation Listeners (These are now handled in JS, removing onclick from HTML is cleaner but onclick works too)
        if(navPartners) navPartners.onclick = () => loadSubPage('trade-partners');
        if(navCompare) navCompare.onclick = () => loadSubPage('trade-compare');

        // 3. Initial Load
        // Load the default subpage HTML first
        await loadSubPage('trade-partners');
        // Then fetch data (which will trigger a render when complete)
        fetchAllData();
    }

    // --- Navigation Logic ---
    window.loadSubPage = async function(pageName) {
        currentSubPage = pageName;

        // 1. Update Tabs Styling
        if (navPartners && navCompare) {
            const activeClass = 'border-blue-500 text-blue-400';
            const inactiveClass = 'border-transparent text-gray-400 hover:text-gray-300';

            if (pageName === 'trade-partners') {
                navPartners.className = navPartners.className.replace(inactiveClass, '').replace('border-transparent', '') + ` ${activeClass}`;
                navCompare.className = navCompare.className.replace(activeClass, '') + ` ${inactiveClass}`;
            } else {
                navCompare.className = navCompare.className.replace(inactiveClass, '').replace('border-transparent', '') + ` ${activeClass}`;
                navPartners.className = navPartners.className.replace(activeClass, '') + ` ${inactiveClass}`;
            }
        }

        // 2. Fetch and Inject HTML
        try {
            // Assuming app.py route: @app.route('/pages/<path:page_name>')
            const response = await fetch(`/pages/${pageName}.html`);
            if (!response.ok) throw new Error(`Failed to load ${pageName}`);
            const html = await response.text();
            subpageContent.innerHTML = html;

            // 3. Render Data into new HTML
            renderCurrentPage();

        } catch (err) {
            console.error(err);
            subpageContent.innerHTML = `<p class="text-red-400">Error loading content.</p>`;
        }
    };

    // --- Data Fetching ---
    async function fetchAllData() {
        if (!userTeamName) {
            if(loadingText) loadingText.textContent = "Please select a team.";
            return;
        }

        if(loadingText) {
            loadingText.textContent = "Loading data...";
            loadingText.classList.remove('hidden');
        }

        await Promise.all([
            fetchCategoryStrengths(), // For Trade Partners
            fetchLeagueRosterData()   // For Trade Compare
        ]);

        if(loadingText) loadingText.textContent = "";
    }

    async function fetchCategoryStrengths() {
        try {
            const response = await fetch('/api/trade_helper_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_name: userTeamName, week: 'all' })
            });
            const data = await response.json();

            // Store Data
            categoryData = data;

            // Populate Dropdowns if needed (only once)
            if (data.all_scoring_categories && tradeFromSelect.options.length <= 1) {
                populateDropdowns(data.all_scoring_categories);
            }

            // Trigger Render
            if (currentSubPage === 'trade-partners') renderCurrentPage();

        } catch (err) {
            console.error("Error fetching category strengths:", err);
        }
    }

    async function fetchLeagueRosterData() {
        const selectedSourcing = localStorage.getItem('selectedStatSourcing') || 'projected';
        try {
            const response = await fetch('/api/trade_helper_league_roster_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcing: selectedSourcing })
            });
            const data = await response.json();

            // Store Data
            rosterData.players = data.players || [];
            rosterData.skaterCategories = data.skater_categories || [];
            rosterData.goalieCategories = data.goalie_categories || [];

            // Trigger Render
            if (currentSubPage === 'trade-compare') renderCurrentPage();

        } catch (err) {
            console.error("Error fetching roster data:", err);
        }
    }

    function populateDropdowns(categories) {
        categories.forEach(cat => {
            const opt1 = document.createElement('option');
            opt1.value = cat; opt1.textContent = cat;
            tradeFromSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = cat; opt2.textContent = cat;
            tradeToSelect.appendChild(opt2);
        });
    }


    // --- Main Render Dispatcher ---
    function renderCurrentPage() {
        if (currentSubPage === 'trade-partners') {
            renderPartnersPage();
        } else if (currentSubPage === 'trade-compare') {
            renderComparePage();
        }
    }

    // --- Subpage 1: Trade Partners Logic ---
    function renderPartnersPage() {
        // Grab elements dynamically (they exist now because HTML is loaded)
        const skaterContainer = document.getElementById('skater-table-container');
        const goalieContainer = document.getElementById('goalie-table-container');

        if (!skaterContainer || !goalieContainer) return; // HTML not ready yet

        if (!categoryData.skater_stats) {
            skaterContainer.innerHTML = '<p class="text-gray-500">Loading stats...</p>';
            return;
        }

        const headers = ['category', 'Rank', 'Average Delta', 'Total'];
        renderSimpleTable(skaterContainer, categoryData.skater_stats, headers);
        renderSimpleTable(goalieContainer, categoryData.goalie_stats, headers);
    }

    function renderSimpleTable(container, data, headers) {
        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-gray-400 p-4">No data found.</p>`;
            return;
        }

        let html = `<table class="min-w-full divide-y divide-gray-700 bg-gray-800 text-sm text-white">`;

        // Header
        html += `<thead class="bg-gray-750"><tr>`;
        headers.forEach(h => html += `<th class="px-4 py-3 text-left font-medium text-gray-300 uppercase">${h.replace('_', ' ')}</th>`);
        html += `</tr></thead>`;

        // Body
        html += `<tbody class="divide-y divide-gray-700">`;
        data.forEach(row => {
            html += `<tr class="hover:bg-gray-700">`;
            headers.forEach(h => {
                let val = row[h];
                let classes = "px-4 py-3 whitespace-nowrap";

                // Formatting
                if (h === 'Rank') {
                    const r = parseInt(val);
                    if (r <= 3) classes += ' text-green-400 font-bold';
                    else if (r >= 8) classes += ' text-red-400';
                    else classes += ' text-yellow-400';
                }
                if (h === 'Average Delta') {
                    const d = parseFloat(val);
                    if (d > 0.5) classes += ' text-green-400';
                    else if (d < -0.5) classes += ' text-red-400';
                }

                html += `<td class="${classes}">${val}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }


    // --- Subpage 2: Trade Compare Logic ---
    function renderComparePage() {
        // Grab elements dynamically
        const userSkaterContainer = document.getElementById('roster-skater-table-container');
        const userGoalieContainer = document.getElementById('roster-goalie-table-container');
        const oppSkaterContainer = document.getElementById('opponent-skater-table-container');
        const oppGoalieContainer = document.getElementById('opponent-goalie-table-container');
        const rosterLoader = document.getElementById('roster-loading');

        // Section swapping elements
        const oppSkaterSection = document.getElementById('opponent-skater-section');
        const oppGoalieSection = document.getElementById('opponent-goalie-section');

        if (!userSkaterContainer) return; // HTML not ready

        if (rosterData.players.length === 0) {
            if(rosterLoader) rosterLoader.textContent = "Loading rosters...";
            return;
        }
        if(rosterLoader) rosterLoader.textContent = "";

        // --- Sorting & Filtering Logic ---
        const tradeFromCategory = tradeFromSelect.value;
        const tradeToCategory = tradeToSelect.value;

        const tradeFromRankKey = tradeFromCategory ? `${tradeFromCategory}_cat_rank` : null;
        const tradeToRankKey = tradeToCategory ? `${tradeToCategory}_cat_rank` : null;

        // 1. Filter
        const userPlayers = rosterData.players.filter(p => p.fantasy_team_name === userTeamName);
        const oppPlayers = rosterData.players.filter(p => p.fantasy_team_name !== userTeamName && p.fantasy_team_name !== 'Free Agent');

        const userSkaters = userPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const userGoalies = userPlayers.filter(p => (p.eligible_positions || '').includes('G'));

        const oppSkaters = oppPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const oppGoalies = oppPlayers.filter(p => (p.eligible_positions || '').includes('G'));

        // 2. Sort
        const sortFn = (key) => (a, b) => {
            if (!key) return 0;
            const rA = a[key], rB = b[key];
            // Push nulls to end
            if (rA == null || rA === 0) return 1;
            if (rB == null || rB === 0) return -1;
            return rA - rB; // Ascending (Rank 1 is best)
        };

        userSkaters.sort(sortFn(tradeFromRankKey));
        userGoalies.sort(sortFn(tradeFromRankKey));

        oppSkaters.sort(sortFn(tradeToRankKey));
        oppGoalies.sort(sortFn(tradeToRankKey));

        // 3. Render Tables
        renderRosterTable(userSkaterContainer, userSkaters, rosterData.skaterCategories, false);
        renderRosterTable(userGoalieContainer, userGoalies, rosterData.goalieCategories, false);
        renderRosterTable(oppSkaterContainer, oppSkaters, rosterData.skaterCategories, true); // True for show Team Name
        renderRosterTable(oppGoalieContainer, oppGoalies, rosterData.goalieCategories, true);

        // 4. Swap Sections (Move Goalies to top if Trade To is a goalie stat)
        const isGoalieStat = rosterData.goalieCategories.includes(tradeToCategory);
        if (oppSkaterSection && oppGoalieSection) {
            if (isGoalieStat) {
                oppGoalieSection.style.order = 1;
                oppSkaterSection.style.order = 2;
            } else {
                oppSkaterSection.style.order = 1;
                oppGoalieSection.style.order = 2;
            }
        }
    }

    function renderRosterTable(container, players, categories, showTeamColumn) {
        if (!players || players.length === 0) {
            container.innerHTML = `<p class="text-gray-400 p-4">No players found.</p>`;
            return;
        }

        let html = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-700 text-sm">`;

        // Headers
        html += `<thead class="bg-gray-700/50"><tr>`;
        html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Player</th>`;
        if (showTeamColumn) html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Team</th>`;
        html += `<th class="px-2 py-1 text-left font-bold text-gray-300">NHL Team</th>`;
        html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Pos</th>`;

        categories.forEach(cat => {
            html += `<th class="px-2 py-1 text-center font-bold text-gray-300" title="${cat}">${cat}</th>`;
        });
        html += `</tr></thead>`;

        // Body
        html += `<tbody class="bg-gray-800 divide-y divide-gray-700">`;
        players.forEach(p => {
            html += `<tr class="hover:bg-gray-700/50">`;
            html += `<td class="px-2 py-1 whitespace-nowrap font-medium text-gray-300">${p.player_name}</td>`;
            if (showTeamColumn) html += `<td class="px-2 py-1 whitespace-nowrap text-yellow-300">${p.fantasy_team_name}</td>`;
            // FIX: Using p.team (from server alias)
            html += `<td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.team}</td>`;
            html += `<td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.eligible_positions}</td>`;

            categories.forEach(cat => {
                const rank = p[cat + '_cat_rank'];
                const display = (rank !== null && rank !== undefined) ? Math.round(rank) : '-';
                const color = getHeatmapColor(rank);
                html += `<td class="px-2 py-1 text-center font-semibold text-gray-600" style="background-color: ${color};">${display}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        container.innerHTML = html;
    }

    function renderPartnersPage() {
        const skaterContainer = document.getElementById('skater-table-container');
        const goalieContainer = document.getElementById('goalie-table-container');
        const recContainer = document.getElementById('trade-recommendations-container');

        if (!skaterContainer || !goalieContainer) return;

        if (!categoryData.skater_stats) {
            skaterContainer.innerHTML = '<p class="text-gray-500">Loading stats...</p>';
            return;
        }

        // 1. Render Analysis Tables (Existing)
        const headers = ['category', 'Rank', 'Average Delta', 'Total'];
        renderSimpleTable(skaterContainer, categoryData.skater_stats, headers);
        renderSimpleTable(goalieContainer, categoryData.goalie_stats, headers);

        // 2. Generate and Render Recommendations (New)
        if (recContainer && categoryData.league_rank_matrix) {
            const matches = findTradeMatches(categoryData.league_rank_matrix, categoryData.total_teams);
            renderTradeMatches(recContainer, matches);
        }
    }


    function findTradeMatches(matrix, totalTeams) {
        const myRanks = matrix[userTeamName];
        if (!myRanks) return [];

        // Define Thresholds (Top 1/3 and Bottom 1/3)
        // e.g. 12 teams -> Strength <= 4, Weakness >= 8
        const strengthThreshold = Math.ceil(totalTeams / 3);
        const weaknessThreshold = totalTeams - Math.floor(totalTeams / 3) + 1;

        let matches = [];

        // Iterate over every other team
        for (const [teamName, teamRanks] of Object.entries(matrix)) {
            if (teamName === userTeamName) continue;

            let youGive = []; // I am strong, they are weak
            let youGet = [];  // I am weak, they are strong

            // Check every category
            for (const cat of Object.keys(myRanks)) {
                const myRank = myRanks[cat];
                const theirRank = teamRanks[cat];

                // Logic: I am Top Tier, They are Bottom Tier
                if (myRank <= strengthThreshold && theirRank >= weaknessThreshold) {
                    youGive.push(cat);
                }

                // Logic: I am Bottom Tier, They are Top Tier
                if (myRank >= weaknessThreshold && theirRank <= strengthThreshold) {
                    youGet.push(cat);
                }
            }

            // Consolidate SA/SV logic
            // If both SA and SV are present, replace them with "Goalie Vol"
            const handleGoalieVol = (arr) => {
                if (arr.includes('SA') && arr.includes('SV')) {
                    return arr.filter(c => c !== 'SA' && c !== 'SV').concat(['Goalie Vol (SA/SV)']);
                }
                return arr;
            };

            youGive = handleGoalieVol(youGive);
            youGet = handleGoalieVol(youGet);

            // Only add if there is a mutual benefit (Give AND Get)
            // Or if there is a massive one-sided fit (optional, sticking to mutual for now)
            if (youGive.length > 0 && youGet.length > 0) {
                matches.push({
                    team: teamName,
                    gives: youGive,
                    gets: youGet,
                    score: youGive.length + youGet.length // Simple sorting score
                });
            }
        }

        // Sort by best fit (most categories involved)
        matches.sort((a, b) => b.score - a.score);

        return matches;
    }

    function renderTradeMatches(container, matches) {
        if (matches.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center p-4 bg-gray-700/50 rounded-lg">
                    <p class="text-gray-300">No perfect mutual matches found based on current rankings.</p>
                    <p class="text-xs text-gray-500">Try looking for teams that are middling in categories you need.</p>
                </div>`;
            return;
        }

        let html = '';
        matches.forEach(m => {
            html += `
            <div class="bg-gray-700/40 border border-gray-600 rounded-lg p-4 hover:bg-gray-700/70 transition duration-200">
                <h4 class="text-lg font-bold text-white mb-3 border-b border-gray-600 pb-2">${m.team}</h4>

                <div class="mb-3">
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Give (Surplus):</p>
                    <div class="flex flex-wrap gap-2">
                        ${m.gives.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-green-900 text-green-200 border border-green-700">${cat}</span>`).join('')}
                    </div>
                </div>

                <div>
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Get (Need):</p>
                    <div class="flex flex-wrap gap-2">
                        ${m.gets.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-blue-900 text-blue-200 border border-blue-700">${cat}</span>`).join('')}
                    </div>
                </div>
            </div>
            `;
        });
        container.innerHTML = html;
    }
    // Start
    init().catch(e => console.error("Init failed", e));

})();
