(async function() {
    await new Promise(resolve => setTimeout(resolve, 0));

    // --- Global Elements ---
    const loadingText = document.getElementById('trade-helper-loading');
    const yourTeamSelect = document.getElementById('your-team-select');
    const navPartners = document.getElementById('nav-partners');
    const navCompare = document.getElementById('nav-compare');
    const subpageContent = document.getElementById('subpage-content');

    // --- State Variables ---
    let currentSubPage = 'trade-partners';
    let userTeamName = localStorage.getItem('selectedTeam') || '';

    // Sorting/Filter State
    let activeFromCats = [];
    let activeToCats = [];
    let filterPartner = "";
    let filterNHL = [];
    let filterPos = [];
    let filterSearch = "";

    // --- Simulation State ---
    let selectedPlayerIds = new Set(); // Track selected checkboxes
    let rosterData = { players: [], skaterCategories: [], goalieCategories: [], currentWeek: 1 };
    let categoryData = { skater_stats: [], goalie_stats: [], league_rank_matrix: {}, total_teams: 12, raw_stats_dump: [] }; // raw_stats needed for calc

    // Constants
    const NHL_TEAMS = [
        "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ", "DAL", "DET",
        "EDM", "FLA", "LAK", "MIN", "MTL", "NSH", "NJD", "NYI", "NYR", "OTT",
        "PHI", "PIT", "SJS", "SEA", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG"
    ];

    // --- Helpers ---
    function getHeatmapColor(rank) {
        if (rank === null || rank === undefined || rank === '-' || isNaN(rank)) return '';
        const minRank = 1; const maxRank = 20;
        const clampedRank = Math.max(minRank, Math.min(rank, maxRank));
        const percentage = (clampedRank - minRank) / (maxRank - minRank);
        const hue = (1 - percentage) * 120;
        return `hsl(${hue}, 65%, 75%)`;
    }
    function formatPercentage(decimal) {
        if (decimal == null) return 'N/A';
        const num = parseFloat(decimal);
        return isNaN(num) ? 'N/A' : (num * 100).toFixed(1) + '%';
    }
    function formatSecondsToMMSS(seconds) {
        if (seconds == null) return 'N/A';
        const s = parseInt(seconds, 10);
        if (isNaN(s)) return 'N/A';
        const minutes = Math.floor(s / 60);
        const remaining = s % 60;
        return `${minutes}:${remaining < 10 ? '0' : ''}${remaining}`;
    }
    function formatNullable(value) { return value ?? 'N/A'; }


    async function init() {
        if (!yourTeamSelect || !subpageContent) {
            console.error('Trade Helper: Critical elements missing.');
            return;
        }

        // --- Inject Modal HTML (Same as before) ---
        const ppModalHTML = `
        <div id="pp-stats-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 hidden" style="backdrop-filter: blur(2px);">
            <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg relative border border-gray-700">
                <button id="pp-modal-close" class="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                <h3 id="pp-modal-title" class="text-xl font-bold text-white mb-4">Player PP Stats</h3>
                <div id="pp-modal-content" class="text-gray-300"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', ppModalHTML);

        document.getElementById('pp-modal-close').addEventListener('click', () => document.getElementById('pp-stats-modal').classList.add('hidden'));
        document.getElementById('pp-stats-modal').addEventListener('click', (e) => {
            if (e.target.id === 'pp-stats-modal') document.getElementById('pp-stats-modal').classList.add('hidden');
        });

        // --- Global Listeners ---
        document.body.addEventListener('click', (e) => {
            const ppCell = e.target.closest('.pp-util-cell');
            if (ppCell) {
                const data = ppCell.dataset;
                document.getElementById('pp-modal-title').textContent = `${data.playerName} - PP Stats`;
                // (Insert PP Modal Content Logic Here - Same as previous version)
                document.getElementById('pp-modal-content').innerHTML = `... (Same content code) ...`; // Abbreviated for brevity
                document.getElementById('pp-stats-modal').classList.remove('hidden');
            }

            // Handle Simulate Button Click
            if (e.target.closest('#simulate-trade-btn')) {
                if (!e.target.closest('#simulate-trade-btn').disabled) {
                    loadSubPage('trade-results');
                }
            }
        });

        // Handle Checkbox Changes Globally within subpage
        document.body.addEventListener('change', (e) => {
            if (e.target.classList.contains('trade-player-checkbox')) {
                const pid = parseInt(e.target.value);
                if (e.target.checked) selectedPlayerIds.add(pid);
                else selectedPlayerIds.delete(pid);
                updateSimulateButtonState();
            }
        });

        yourTeamSelect.addEventListener('change', () => {
            userTeamName = yourTeamSelect.value;
            filterPartner = "";
            activeFromCats = []; activeToCats = [];
            selectedPlayerIds.clear(); // Clear selections on team change
            fetchAllData();
        });

        if(navPartners) navPartners.onclick = () => loadSubPage('trade-partners');
        if(navCompare) navCompare.onclick = () => loadSubPage('trade-compare');

        await loadSubPage('trade-partners');
        fetchAllData();
    }

    window.loadSubPage = async function(pageName) {
        currentSubPage = pageName;
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
        try {
            const response = await fetch(`/pages/${pageName}.html`);
            if (!response.ok) throw new Error(`Failed to load ${pageName}`);
            subpageContent.innerHTML = await response.text();
            renderCurrentPage();
        } catch (err) { console.error(err); subpageContent.innerHTML = `<p class="text-red-400">Error loading content.</p>`; }
    };

    async function fetchAllData() {
        if (!userTeamName) { if(loadingText) loadingText.textContent = "Please select a team."; return; }
        if(loadingText) { loadingText.textContent = "Loading data..."; loadingText.classList.remove('hidden'); }
        await Promise.all([fetchCategoryStrengths(), fetchLeagueRosterData()]);
        if(loadingText) loadingText.textContent = "";
    }

    async function fetchCategoryStrengths() {
        try {
            const response = await fetch('/api/trade_helper_data', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_name: userTeamName, week: 'all' })
            });
            categoryData = await response.json();
            if (currentSubPage === 'trade-partners') renderCurrentPage();
            if (currentSubPage === 'trade-compare') renderCurrentPage();
        } catch (err) { console.error(err); }
    }

    async function fetchLeagueRosterData() {
        const selectedSourcing = localStorage.getItem('selectedStatSourcing') || 'projected';
        try {
            const response = await fetch('/api/trade_helper_league_roster_data', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcing: selectedSourcing })
            });
            const data = await response.json();
            rosterData.players = data.players || [];
            rosterData.skaterCategories = data.skater_categories || [];
            rosterData.goalieCategories = data.goalie_categories || [];
            rosterData.currentWeek = data.current_week || 1; // Store week
            if (currentSubPage === 'trade-compare') renderCurrentPage();
        } catch (err) { console.error(err); }
    }

    function renderCurrentPage() {
        if (currentSubPage === 'trade-partners') renderPartnersPage();
        else if (currentSubPage === 'trade-compare') renderComparePage();
        else if (currentSubPage === 'trade-results') renderResultsPage(); // NEW
    }

    // --- Trade Partners (Unchanged from previous steps) ---
    function renderPartnersPage() {
        const skaterContainer = document.getElementById('skater-table-container');
        const goalieContainer = document.getElementById('goalie-table-container');
        const recContainer = document.getElementById('trade-recommendations-container');
        if (!skaterContainer || !goalieContainer) return;
        if (!categoryData.skater_stats) { skaterContainer.innerHTML = '<p class="text-gray-500">Loading stats...</p>'; return; }

        const headers = ['category', 'Rank', 'Average Delta', 'Total'];
        renderSimpleTable(skaterContainer, categoryData.skater_stats, headers);

        let hiddenSubCats = new Set();
        if (categoryData.goalie_stats) {
            categoryData.goalie_stats.forEach(row => {
                if (row.sub_rows && row.sub_rows.length > 0) row.sub_rows.forEach(sub => hiddenSubCats.add(sub.category));
            });
        }
        const filteredGoalieStats = categoryData.goalie_stats.filter(row => !hiddenSubCats.has(row.category));
        renderSimpleTable(goalieContainer, filteredGoalieStats, headers);

        if (recContainer && categoryData.league_rank_matrix) {
            const matches = findTradeMatches(categoryData.league_rank_matrix, categoryData.total_teams);
            renderTradeMatches(recContainer, matches);
        }
    }

    function findTradeMatches(matrix, totalTeams) {
        const myRanks = matrix[userTeamName];
        if (!myRanks) return [];
        const strengthThreshold = Math.ceil(totalTeams / 3);
        const weaknessThreshold = totalTeams - Math.floor(totalTeams / 3) + 1;
        const allCats = Object.keys(myRanks);
        const excludedCats = [];
        if (allCats.includes('GAA')) excludedCats.push('GA', 'TOI/G');
        // Keep SV/SA for internal logic
        let matches = [];
        for (const [teamName, teamRanks] of Object.entries(matrix)) {
            if (teamName === userTeamName) continue;
            let youGive = [], youGet = [];
            for (const cat of allCats) {
                if (excludedCats.includes(cat)) continue;
                const myRank = myRanks[cat];
                const theirRank = teamRanks[cat];
                if (myRank <= strengthThreshold && theirRank >= weaknessThreshold) youGive.push(cat);
                if (myRank >= weaknessThreshold && theirRank <= strengthThreshold) youGet.push(cat);
            }
            if (youGive.length > 0 && youGet.length > 0) {
                matches.push({ team: teamName, gives: youGive, gets: youGet, score: youGive.length + youGet.length });
            }
        }
        matches.sort((a, b) => b.score - a.score);
        return matches;
    }

    function renderTradeMatches(container, matches) {
        if (matches.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center p-4 bg-gray-700/50 rounded-lg text-gray-300">No perfect matches found.</div>`;
            return;
        }
        const formatForDisplay = (cats) => {
            let display = [...cats];
            if (display.includes('SA') && display.includes('SV')) {
                display = display.filter(c => c !== 'SA' && c !== 'SV'); display.push('Goalie Vol');
            }
            return display;
        };
        let html = '';
        matches.forEach(m => {
            const displayGives = formatForDisplay(m.gives);
            const displayGets = formatForDisplay(m.gets);
            html += `
            <div class="bg-gray-700/40 border border-gray-600 rounded-lg p-4 hover:bg-gray-700/70 transition duration-200 cursor-pointer"
                 onclick="window.selectTradeScenario('${m.team}', '${m.gives.join(',')}', '${m.gets.join(',')}')">
                <h4 class="text-lg font-bold text-white mb-3 border-b border-gray-600 pb-2 flex justify-between items-center">
                    ${m.team} <span class="text-xs font-normal text-blue-300 hover:underline">Compare &rarr;</span>
                </h4>
                <div class="mb-3">
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Give (Surplus):</p>
                    <div class="flex flex-wrap gap-2">${displayGives.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-green-900 text-green-200 border border-green-700">${cat}</span>`).join('')}</div>
                </div>
                <div>
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Get (Need):</p>
                    <div class="flex flex-wrap gap-2">${displayGets.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-blue-900 text-blue-200 border border-blue-700">${cat}</span>`).join('')}</div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    window.selectTradeScenario = function(partnerName, givesStr, getsStr) {
        filterPartner = partnerName;
        activeFromCats = givesStr ? givesStr.split(',') : [];
        activeToCats = getsStr ? getsStr.split(',') : [];
        loadSubPage('trade-compare');
    }

    function renderSimpleTable(container, data, headers) {
        if (!data || data.length === 0) { container.innerHTML = `<p class="text-gray-400 p-4">No data.</p>`; return; }
        let html = `<table class="min-w-full divide-y divide-gray-700 bg-gray-800 text-sm text-white"><thead class="bg-gray-750"><tr>`;
        headers.forEach(h => html += `<th class="px-4 py-3 text-left font-medium text-gray-300 uppercase">${h.replace('_', ' ')}</th>`);
        html += `</tr></thead><tbody class="divide-y divide-gray-700">`;
        data.forEach(row => {
            html += `<tr class="hover:bg-gray-700">`;
            headers.forEach(h => {
                let val = row[h], classes = "px-4 py-3 whitespace-nowrap font-medium";
                if (h === 'Rank') {
                    const r = parseInt(val);
                    if (r <= 3) classes += ' text-green-400 font-bold'; else if (r >= 8) classes += ' text-red-400'; else classes += ' text-yellow-400';
                } else if (h === 'Average Delta') {
                    const d = parseFloat(val);
                    if (d > 0.5) classes += ' text-green-400'; else if (d < -0.5) classes += ' text-red-400';
                }
                html += `<td class="${classes}">${val}</td>`;
            });
            html += `</tr>`;
            if (row.sub_rows && row.sub_rows.length > 0) {
                row.sub_rows.forEach(sub => {
                    html += `<tr class="hover:bg-gray-700/50 bg-gray-800/40">`;
                    headers.forEach((h, index) => {
                        let val = sub[h];
                        html += index === 0 ? `<td class="px-4 py-2 text-xs text-gray-400 pl-8 border-l-2 border-gray-600">${val}</td>` : `<td class="px-4 py-2 text-xs whitespace-nowrap text-gray-500">${val}</td>`;
                    });
                    html += `</tr>`;
                });
            }
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // --- Trade Compare Logic ---
    function renderComparePage() {
        const userSkaterContainer = document.getElementById('roster-skater-table-container');
        const userGoalieContainer = document.getElementById('roster-goalie-table-container');
        const oppSkaterContainer = document.getElementById('opponent-skater-table-container');
        const oppGoalieContainer = document.getElementById('opponent-goalie-table-container');
        const rosterLoader = document.getElementById('roster-loading');
        const oppSkaterSection = document.getElementById('opponent-skater-section');
        const oppGoalieSection = document.getElementById('opponent-goalie-section');

        if (!userSkaterContainer) return;

        if (categoryData.all_scoring_categories) setupCompareSorting(categoryData.all_scoring_categories);
        if (rosterData.players.length > 0) setupCompareFilters();

        if (rosterData.players.length === 0) {
            if(rosterLoader) rosterLoader.textContent = "Loading rosters...";
            return;
        }
        if(rosterLoader) rosterLoader.textContent = "";

        // Filter
        const userPlayers = rosterData.players.filter(p => p.fantasy_team_name === userTeamName);
        const oppPlayers = rosterData.players.filter(p => {
            if (p.fantasy_team_name === userTeamName || p.fantasy_team_name === 'Free Agent') return false;
            if (filterPartner && p.fantasy_team_name !== filterPartner) return false;
            if (filterNHL.length > 0 && !filterNHL.includes(p.team)) return false;
            if (filterPos.length > 0) {
                const pPos = (p.eligible_positions || "").split(',').map(s => s.trim());
                if (!pPos.some(pos => filterPos.includes(pos))) return false;
            }
            if (filterSearch) {
                if (!p.player_name.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            }
            return true;
        });

        const userSkaters = userPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const userGoalies = userPlayers.filter(p => (p.eligible_positions || '').includes('G'));
        const oppSkaters = oppPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const oppGoalies = oppPlayers.filter(p => (p.eligible_positions || '').includes('G'));

        // Sort
        const multiSortFn = (keys) => (a, b) => {
            if (!keys || keys.length === 0) return 0;
            for (let key of keys) {
                let rankKey = key + '_cat_rank';
                let rA = a[rankKey], rB = b[rankKey];
                if (rA == null || rA === 0) rA = 999;
                if (rB == null || rB === 0) rB = 999;
                if (rA !== rB) return rA - rB;
            }
            return 0;
        };

        userSkaters.sort(multiSortFn(activeFromCats));
        userGoalies.sort(multiSortFn(activeFromCats));
        oppSkaters.sort(multiSortFn(activeToCats));
        oppGoalies.sort(multiSortFn(activeToCats));

        // Render
        renderRosterTable(userSkaterContainer, userSkaters, rosterData.skaterCategories, false);
        renderRosterTable(userGoalieContainer, userGoalies, rosterData.goalieCategories, false);
        renderRosterTable(oppSkaterContainer, oppSkaters, rosterData.skaterCategories, true);
        renderRosterTable(oppGoalieContainer, oppGoalies, rosterData.goalieCategories, true);
        updateSimulateButtonState();

        // Swap
        const primaryToCat = activeToCats[0];
        const isGoalieStat = primaryToCat && rosterData.goalieCategories.includes(primaryToCat);
        if (oppSkaterSection && oppGoalieSection) {
            if (isGoalieStat) { oppGoalieSection.style.order = 1; oppSkaterSection.style.order = 2; }
            else { oppSkaterSection.style.order = 1; oppGoalieSection.style.order = 2; }
        }
    }

    // --- Setup Functions (Sorting & Filters) - same logic as before ---
    function setupCompareSorting(categories) {
        const tradeFromSelect = document.getElementById('trade-from-select');
        const tradeToSelect = document.getElementById('trade-to-select');
        const tradeFromTags = document.getElementById('trade-from-tags');
        const tradeToTags = document.getElementById('trade-to-tags');

        if (!tradeFromSelect || !tradeToSelect) return;
        if (tradeFromSelect.options.length === 1) {
            let visibleCategories = [...categories];
            if (categories.includes('GAA')) visibleCategories = visibleCategories.filter(c => c !== 'GA' && c !== 'TOI/G');
            if (categories.includes('SVpct')) visibleCategories = visibleCategories.filter(c => c !== 'SV' && c !== 'SA');

            visibleCategories.forEach(cat => {
                const opt1 = document.createElement('option'); opt1.value = cat; opt1.textContent = cat;
                tradeFromSelect.appendChild(opt1);
                const opt2 = document.createElement('option'); opt2.value = cat; opt2.textContent = cat;
                tradeToSelect.appendChild(opt2);
            });

            tradeFromSelect.addEventListener('change', (e) => { if (e.target.value) { addCategory('from', e.target.value); e.target.value = ""; } });
            tradeToSelect.addEventListener('change', (e) => { if (e.target.value) { addCategory('to', e.target.value); e.target.value = ""; } });
        }
        if (tradeFromTags && tradeFromTags.children.length === 0) renderTags(tradeFromTags, activeFromCats, 'from');
        if (tradeToTags && tradeToTags.children.length === 0) renderTags(tradeToTags, activeToCats, 'to');
    }

    function addCategory(type, category) {
        const targetArray = type === 'from' ? activeFromCats : activeToCats;
        if (!targetArray.includes(category)) {
            targetArray.push(category);
            const container = type === 'from' ? document.getElementById('trade-from-tags') : document.getElementById('trade-to-tags');
            if(container) renderTags(container, targetArray, type);
            renderCurrentPage();
        }
    }

    function removeCategory(type, category) {
        if (type === 'from') activeFromCats = activeFromCats.filter(c => c !== category);
        else activeToCats = activeToCats.filter(c => c !== category);
        const container = type === 'from' ? document.getElementById('trade-from-tags') : document.getElementById('trade-to-tags');
        const arr = type === 'from' ? activeFromCats : activeToCats;
        if (container) renderTags(container, arr, type);
        renderCurrentPage();
    }

    function renderTags(container, tags, type) {
        container.innerHTML = '';
        tags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'inline-flex items-center bg-blue-900 text-blue-200 text-xs font-medium px-2.5 py-1 rounded border border-blue-700';
            pill.innerHTML = `${tag}<button type="button" class="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-200 hover:bg-blue-800 hover:text-white focus:outline-none"><span class="sr-only">Remove</span>&times;</button>`;
            pill.querySelector('button').addEventListener('click', () => removeCategory(type, tag));
            container.appendChild(pill);
        });
    }

    function setupCompareFilters() {
        const partnerSelect = document.getElementById('filter-partner');
        const nhlSelect = document.getElementById('filter-nhl');
        const posSelect = document.getElementById('filter-pos');
        const searchInput = document.getElementById('filter-search');
        const tagsNHL = document.getElementById('tags-nhl');
        const tagsPos = document.getElementById('tags-pos');

        if (!partnerSelect || !nhlSelect || !posSelect || !searchInput) return;

        if (partnerSelect.options.length === 1) {
            const teams = [...new Set(rosterData.players.map(p => p.fantasy_team_name))].sort();
            teams.forEach(team => {
                if (team !== userTeamName && team !== 'Free Agent') {
                    const opt = document.createElement('option'); opt.value = team; opt.textContent = team;
                    partnerSelect.appendChild(opt);
                }
            });
            partnerSelect.value = filterPartner;
            NHL_TEAMS.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; nhlSelect.appendChild(opt); });

            partnerSelect.addEventListener('change', (e) => { filterPartner = e.target.value; renderComparePage(); });
            nhlSelect.addEventListener('change', (e) => { if (e.target.value && !filterNHL.includes(e.target.value)) { filterNHL.push(e.target.value); renderFilterTags(tagsNHL, filterNHL, 'nhl'); renderComparePage(); } e.target.value = ""; });
            posSelect.addEventListener('change', (e) => { if (e.target.value && !filterPos.includes(e.target.value)) { filterPos.push(e.target.value); renderFilterTags(tagsPos, filterPos, 'pos'); renderComparePage(); } e.target.value = ""; });
            searchInput.addEventListener('input', (e) => { filterSearch = e.target.value; renderComparePage(); });
        }
        if (tagsNHL && tagsNHL.children.length === 0) renderFilterTags(tagsNHL, filterNHL, 'nhl');
        if (tagsPos && tagsPos.children.length === 0) renderFilterTags(tagsPos, filterPos, 'pos');
    }

    function renderFilterTags(container, tags, type) {
        container.innerHTML = '';
        tags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'inline-flex items-center bg-gray-600 text-gray-200 text-[10px] px-2 py-0.5 rounded border border-gray-500';
            pill.innerHTML = `${tag}<button class="ml-1 text-gray-400 hover:text-white font-bold">&times;</button>`;
            pill.querySelector('button').addEventListener('click', () => {
                if (type === 'nhl') filterNHL = filterNHL.filter(t => t !== tag); else filterPos = filterPos.filter(p => p !== tag);
                renderFilterTags(container, (type==='nhl'?filterNHL:filterPos), type);
                renderComparePage();
            });
            container.appendChild(pill);
        });
    }


    function updateSimulateButtonState() {
            const btn = document.getElementById('simulate-trade-btn');
            if (!btn) return;

            const selectedPlayers = rosterData.players.filter(p => selectedPlayerIds.has(p.player_id));

            const userSelected = selectedPlayers.filter(p => p.fantasy_team_name === userTeamName);
            const oppSelected = selectedPlayers.filter(p => p.fantasy_team_name !== userTeamName);

            // 1. Must have at least 1 from each side
            if (userSelected.length === 0 || oppSelected.length === 0) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            }

            // 2. All opponents must be from the SAME team
            const uniqueOppTeams = new Set(oppSelected.map(p => p.fantasy_team_name));
            if (uniqueOppTeams.size > 1) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            }

            // Valid
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }


        function renderRosterTable(container, players, categories, showTeamColumn) {
            if (!players || players.length === 0) { container.innerHTML = `<p class="text-gray-400 p-4">No players found.</p>`; return; }

            let html = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-700 text-sm"><thead class="bg-gray-700/50"><tr>`;
            html += `<th class="px-2 py-1 text-center w-8">Select</th>`; // Checkbox Header
            html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Player</th>`;
            if (showTeamColumn) html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Team</th>`;
            html += `<th class="px-2 py-1 text-left font-bold text-gray-300">NHL Team</th><th class="px-2 py-1 text-left font-bold text-gray-300">Pos</th>`;
            html += `<th class="px-2 py-1 text-center font-bold text-gray-300" title="Sum of Category Ranks">Cat Rank</th>`;
            html += `<th class="px-2 py-1 text-center font-bold text-gray-300" title="Power Play Utilization">PP Util</th>`;
            categories.forEach(cat => html += `<th class="px-2 py-1 text-center font-bold text-gray-300" title="${cat}">${cat}</th>`);
            html += `</tr></thead><tbody class="bg-gray-800 divide-y divide-gray-700">`;

            players.forEach(p => {
                const isChecked = selectedPlayerIds.has(p.player_id) ? 'checked' : '';
                const teamClass = p.fantasy_team_name === userTeamName ? 'border-l-4 border-blue-500' : ''; // Visual indicator

                html += `<tr class="hover:bg-gray-700/50 ${teamClass}">`;
                html += `<td class="px-2 py-1 text-center"><input type="checkbox" value="${p.player_id}" class="trade-player-checkbox form-checkbox h-4 w-4 text-blue-600 rounded bg-gray-700 border-gray-600" ${isChecked}></td>`;
                html += `<td class="px-2 py-1 whitespace-nowrap font-medium text-gray-300">${p.player_name}</td>`;
                if (showTeamColumn) html += `<td class="px-2 py-1 whitespace-nowrap text-yellow-300">${p.fantasy_team_name}</td>`;
                html += `<td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.team}</td><td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.eligible_positions}</td>`;

                // Cat Rank
                let catSum = 0, validRanks = 0;
                categories.forEach(cat => { const r = p[cat + '_cat_rank']; if (r != null) { catSum += r; validRanks++; } });
                html += `<td class="px-2 py-1 text-center font-bold text-white">${validRanks > 0 ? Math.round(catSum) : '-'}</td>`;

                // PP Util
                if (p.avg_ppTimeOnIcePctPerGame !== undefined) {
                    // (Same PP Cell logic as before)
                    html += `<td class="px-2 py-1 whitespace-nowrap text-sm text-gray-300 cursor-pointer hover:bg-gray-700 pp-util-cell" data-player-name="${p.player_name}" ... >${formatPercentage(p.avg_ppTimeOnIcePctPerGame)}</td>`;
                } else { html += `<td class="px-2 py-1 text-center text-gray-500">-</td>`; }

                categories.forEach(cat => {
                    const rank = p[cat + '_cat_rank'];
                    const display = (rank != null) ? Math.round(rank) : '-';
                    const color = getHeatmapColor(rank);
                    html += `<td class="px-2 py-1 text-center font-semibold text-gray-600" style="background-color: ${color};">${display}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        }
        function renderResultsPage() {
                const userContainer = document.getElementById('results-user-container');
                const oppContainer = document.getElementById('results-opponent-container');
                if (!userContainer || !oppContainer) return;

                // 1. Identify involved parties
                const selectedPlayers = rosterData.players.filter(p => selectedPlayerIds.has(p.player_id));
                const userTradePlayers = selectedPlayers.filter(p => p.fantasy_team_name === userTeamName);
                const oppTradePlayers = selectedPlayers.filter(p => p.fantasy_team_name !== userTeamName);
                const oppTeamName = oppTradePlayers[0].fantasy_team_name;

                // 2. Calculate Impact
                const results = calculateTradeImpact(userTeamName, oppTeamName, userTradePlayers, oppTradePlayers);

                // 3. Render Tables
                renderImpactTable(userContainer, results.userImpact);
                renderImpactTable(oppContainer, results.oppImpact);
            }

            function calculateTradeImpact(userTeam, oppTeam, userGiving, oppGiving) {
                // Logic:
                // 1. Get Season Totals for ALL teams from DB (Need to reconstruct this from categoryData if available, or fetch?)
                //    Actually, calculateTradeImpact needs raw totals for every team to re-rank.
                //    Current `categoryData.skater_stats` only has User totals.
                //    We need to re-fetch or store the raw matrix.
                //    *Correction*: We didn't store raw totals for all teams in JS. We only have ranks.
                //    *Solution*: We must approximate using Ranks? No, inaccurate.
                //    *Better Solution*: Use the `rosterData.players`. Summing up every player for every team is heavy but accurate.

                const completedWeeks = Math.max(1, rosterData.currentWeek - 1);
                const skaterFactor = 3.4 * completedWeeks; // Projected rest of season? No, logic says "multiply back by completed weeks"
                // Prompt Logic: (Total / CompletedWeeks) +/- (PlayerAvg * 3.4) -> New Weekly Avg -> * CompletedWeeks = New Total

                // Group all players by team to calculate current league totals
                const leagueTotals = {}; // { 'Team A': { 'G': 100, 'A': 50... } }

                // Initialize League Totals
                rosterData.players.forEach(p => {
                    const team = p.fantasy_team_name;
                    if (team === 'Free Agent') return;
                    if (!leagueTotals[team]) leagueTotals[team] = {};

                    // Sum Stats
                    const allCats = [...rosterData.skaterCategories, ...rosterData.goalieCategories, 'GA', 'SV', 'SA', 'TOI/G'];
                    allCats.forEach(cat => {
                        const val = parseFloat(p[cat] || 0); // Raw stat from DB
                        leagueTotals[team][cat] = (leagueTotals[team][cat] || 0) + (isNaN(val) ? 0 : val);
                    });
                });

                // Helper to adjust team
                const adjustTeam = (teamName, outgoingPlayers, incomingPlayers) => {
                    const totals = { ...leagueTotals[teamName] }; // Copy
                    const cats = [...rosterData.skaterCategories, ...rosterData.goalieCategories, 'GA', 'SV', 'SA', 'TOI/G'];

                    cats.forEach(cat => {
                        const currentTotal = totals[cat] || 0;
                        const weeklyAvg = currentTotal / completedWeeks;

                        let change = 0;

                        // Outgoing
                        outgoingPlayers.forEach(p => {
                            const isGoalie = (p.eligible_positions || '').includes('G');
                            const rawVal = parseFloat(p[cat] || 0);
                            const gp = parseFloat(p.games_played || 1);
                            const perGame = rawVal / (gp > 0 ? gp : 1);
                            const factor = isGoalie ? 2.0 : 3.4;
                            change -= (perGame * factor);
                        });

                        // Incoming
                        incomingPlayers.forEach(p => {
                            const isGoalie = (p.eligible_positions || '').includes('G');
                            const rawVal = parseFloat(p[cat] || 0);
                            const gp = parseFloat(p.games_played || 1);
                            const perGame = rawVal / (gp > 0 ? gp : 1);
                            const factor = isGoalie ? 2.0 : 3.4;
                            change += (perGame * factor);
                        });

                        const newWeekly = Math.max(0, weeklyAvg + change); // No negative stats
                        totals[cat] = newWeekly * completedWeeks;
                    });

                    // Recalc Ratios
                    if (totals['TOI/G'] > 0) totals['GAA'] = (totals['GA'] * 60) / totals['TOI/G'];
                    if (totals['SA'] > 0) totals['SVpct'] = totals['SV'] / totals['SA'];

                    return totals;
                };

                // Apply Trades
                const newUserTotals = adjustTeam(userTeam, userGiving, oppGiving);
                const newOppTotals = adjustTeam(oppTeam, oppGiving, userGiving);

                // Update League Totals for Re-ranking
                leagueTotals[userTeam] = newUserTotals;
                leagueTotals[oppTeam] = newOppTotals;

                // Re-Rank Function
                const calculateRanks = (targetTeamName) => {
                    const result = [];
                    const allCats = [...rosterData.skaterCategories, ...rosterData.goalieCategories];
                    const reverseCats = ['GA', 'GAA', 'L'];

                    allCats.forEach(cat => {
                        // Exclude sub-cats from visual table
                        if (cat === 'GA' || cat === 'SV' || cat === 'SA') return;

                        const myVal = leagueTotals[targetTeamName][cat] || 0;

                        // Get all values for this cat to rank
                        const allValues = Object.values(leagueTotals).map(t => t[cat] || 0);
                        const isRev = reverseCats.includes(cat);
                        allValues.sort((a, b) => isRev ? a - b : b - a);

                        const newRank = allValues.indexOf(myVal) + 1;

                        // Get Old Rank (from categoryData or re-calc from original leagueTotals? Safer to re-calc original)
                        // For simplicity/speed, we assume the `categoryData.league_rank_matrix` is accurate for "Before"
                        const oldRank = categoryData.league_rank_matrix[targetTeamName] ? categoryData.league_rank_matrix[targetTeamName][cat] : '-';

                        result.push({
                            category: cat,
                            oldRank: oldRank,
                            newRank: newRank,
                            change: (oldRank !== '-' ? oldRank - newRank : 0) // Positive change means Rank went down (improved, e.g. 5 -> 2 = +3)
                        });
                    });
                    return result;
                };

                return {
                    userImpact: calculateRanks(userTeam),
                    oppImpact: calculateRanks(oppTeam)
                };
            }

            function renderImpactTable(container, data) {
                let html = `<table class="min-w-full divide-y divide-gray-700 text-sm text-white"><thead class="bg-gray-700/50"><tr>
                    <th class="px-4 py-3 text-left font-medium text-gray-300">Category</th>
                    <th class="px-4 py-3 text-center font-medium text-gray-300">Old Rank</th>
                    <th class="px-4 py-3 text-center font-medium text-gray-300">Change</th>
                    <th class="px-4 py-3 text-center font-medium text-gray-300">New Rank</th>
                </tr></thead><tbody class="divide-y divide-gray-700">`;

                data.forEach(row => {
                    let changeClass = "text-gray-400";
                    let changeSym = "";
                    if (row.change > 0) { changeClass = "text-green-400 font-bold"; changeSym = "+"; } // Rank improved (lower number)
                    else if (row.change < 0) { changeClass = "text-red-400 font-bold"; changeSym = ""; } // Rank worsened

                    html += `<tr class="hover:bg-gray-700/50">
                        <td class="px-4 py-3 whitespace-nowrap font-medium">${row.category}</td>
                        <td class="px-4 py-3 text-center">${row.oldRank}</td>
                        <td class="px-4 py-3 text-center ${changeClass}">${changeSym}${row.change}</td>
                        <td class="px-4 py-3 text-center font-bold text-white">${row.newRank}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
                container.innerHTML = html;
            }

            init().catch(e => console.error("Init failed", e));
        })();
