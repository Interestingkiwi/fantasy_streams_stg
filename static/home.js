document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-button');
    const timestampText = document.getElementById('timestamp-text');
    const dropdownContainer = document.getElementById('dropdown-container');

    let pageData = null; // To store weeks, teams, etc.

    async function handleLogout() {
        // Redirect to logout endpoint, which will clear the session
        window.location.href = '/logout';
    }

    async function getTimestamp() {
        try {
            const response = await fetch('/api/db_timestamp');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch timestamp.');
            }

            if (data.timestamp) {
/* timestampText.textContent = `League data was last pulled from Yahoo at ${data.timestamp}`; */
                timestampText.textContent = `League data exists, check League Database tab for last update`;
            } else {
                timestampText.textContent = 'League data has not been updated yet. Please visit the League Database page.';
            }
        } catch (error) {
            console.error('Error setting timestamp:', error);
            timestampText.textContent = 'Error loading league data status.';
        }
    }

    // *** NEW FUNCTION TO INITIALIZE THE STAT SOURCING DROPDOWN ***
    function initStatSourcingDropdown() {
        const statSourcingSelect = document.getElementById('stat-sourcing-select');
        if (!statSourcingSelect) return; // Exit if element doesn't exist

        const options = [
            { value: 'projected', text: 'Projected ROS' },
            { value: 'todate', text: 'Season To Date' },
            { value: 'combined', text: 'Combined' }
        ];

        let sourcingOptions = '';
        options.forEach(opt => {
            sourcingOptions += `<option value="${opt.value}">${opt.text}</option>`;
        });
        statSourcingSelect.innerHTML = sourcingOptions;

        // Restore selection from localStorage or set default
        const savedStatSourcing = localStorage.getItem('selectedStatSourcing');
        if (savedStatSourcing && options.some(o => o.value === savedStatSourcing)) {
            statSourcingSelect.value = savedStatSourcing;
        } else {
            // Default to 'projected' if nothing is saved or value is invalid
            statSourcingSelect.value = 'projected';
            localStorage.setItem('selectedStatSourcing', 'projected');
        }

        // Add event listener to save changes to localStorage
        statSourcingSelect.addEventListener('change', () => {
            localStorage.setItem('selectedStatSourcing', statSourcingSelect.value);
        });
    }

    async function initDropdowns() {
        // *** MOVED STAT SOURCING INIT TO ITS OWN FUNCTION ***

        try {
            const response = await fetch('/api/matchup_data');
            pageData = await response.json();

            if (!response.ok) {
                throw new Error(pageData.error || 'Failed to fetch page data');
            }

            const weekSelect = document.getElementById('week-select');
            const yourTeamSelect = document.getElementById('your-team-select');

            if (!weekSelect || !yourTeamSelect) {
                console.error('Week or Team select dropdown not found');
                return;
            }

            // Populate Week Select
            let weekOptions = '';
            pageData.weeks.forEach(week => {
                weekOptions += `<option value="${week.week_num}">${week.label}</option>`;
            });
            weekSelect.innerHTML = weekOptions;

            // Populate Team Select
            let teamOptions = '';
            pageData.teams.forEach(team => {
                teamOptions += `<option value="${team.team_id}">${team.name}</option>`;
            });
            yourTeamSelect.innerHTML = teamOptions;

            // Restore team selection from localStorage
            const savedTeam = localStorage.getItem('selectedTeam');
            if (savedTeam) {
                yourTeamSelect.value = savedTeam;
            }

            // Check if a session has started to handle the week selection
            if (!sessionStorage.getItem('fantasySessionStarted')) {
                // This is a new session. Default to the current week.
                const currentWeek = pageData.current_week;
                weekSelect.value = currentWeek;
                // Save it to localStorage so it persists during navigation
                localStorage.setItem('selectedWeek', currentWeek);
                // Mark the session as started
                sessionStorage.setItem('fantasySessionStarted', 'true');
            } else {
                // A session is active. Restore the last selected week from localStorage.
                const savedWeek = localStorage.getItem('selectedWeek');
                if (savedWeek) {
                    weekSelect.value = savedWeek;
                } else {
                    // As a fallback, use the current week if nothing is in localStorage
                    weekSelect.value = pageData.current_week;
                }
            }
        } catch (error) {
            console.error('Error initializing dropdowns:', error);
            if (dropdownContainer) {
                dropdownContainer.innerHTML = `<p class="text-red-400">Error loading league data. Please try updating the database.</p>`;
            }
        }
    }

    if(logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    if(timestampText) {
        getTimestamp();
    }

    // Initialize all dropdowns on page load
    initStatSourcingDropdown(); // *** CALL THE NEW FUNCTION ***
    initDropdowns();
});
