/**
 * IPL 2026 league stage (70 matches). 
 */

const VENUE_STADIUM = {
    Bengaluru: 'M. Chinnaswamy Stadium, Bengaluru',
    Mumbai: 'Wankhede Stadium, Mumbai',
    Guwahati: 'Barsapara Cricket Stadium, Guwahati',
    'New Chandigarh': 'Maharaja Yadavindra Singh Stadium, Mullanpur (New Chandigarh)',
    Lucknow: 'BRSABV Ekana Cricket Stadium, Lucknow',
    Kolkata: 'Eden Gardens, Kolkata',
    Chennai: 'MA Chidambaram Stadium, Chennai',
    Delhi: 'Arun Jaitley Stadium, Delhi',
    Ahmedabad: 'Narendra Modi Stadium, Ahmedabad',
    Hyderabad: 'Rajiv Gandhi International Stadium, Hyderabad',
    Jaipur: 'Sawai Mansingh Stadium, Jaipur',
    Raipur: 'Shaheed Veer Narayan Singh International Stadium, Raipur',
    Dharamshala: 'HPCA Stadium, Dharamshala'
};

function stadiumFor(city) {
    return VENUE_STADIUM[city] || city;
}

const rows = [
    ['2026-03-28', 'RCB', 'SRH', 'Bengaluru', false],
    ['2026-03-29', 'MI', 'KKR', 'Mumbai', false],
    ['2026-03-30', 'RR', 'CSK', 'Guwahati', false],
    ['2026-03-31', 'PBKS', 'GT', 'New Chandigarh', false],
    ['2026-04-01', 'LSG', 'DC', 'Lucknow', false],
    ['2026-04-02', 'KKR', 'SRH', 'Kolkata', false],
    ['2026-04-03', 'CSK', 'PBKS', 'Chennai', false],
    ['2026-04-04', 'DC', 'MI', 'Delhi', true],
    ['2026-04-04', 'GT', 'RR', 'Ahmedabad', false],
    ['2026-04-05', 'SRH', 'LSG', 'Hyderabad', true],
    ['2026-04-05', 'RCB', 'CSK', 'Bengaluru', false],
    ['2026-04-06', 'KKR', 'PBKS', 'Kolkata', false],
    ['2026-04-07', 'RR', 'MI', 'Guwahati', false],
    ['2026-04-08', 'DC', 'GT', 'Delhi', false],
    ['2026-04-09', 'KKR', 'LSG', 'Kolkata', false],
    ['2026-04-10', 'RR', 'RCB', 'Guwahati', false],
    ['2026-04-11', 'PBKS', 'SRH', 'New Chandigarh', true],
    ['2026-04-11', 'CSK', 'DC', 'Chennai', false],
    ['2026-04-12', 'LSG', 'GT', 'Lucknow', true],
    ['2026-04-12', 'MI', 'RCB', 'Mumbai', false],
    ['2026-04-13', 'SRH', 'RR', 'Hyderabad', false],
    ['2026-04-14', 'CSK', 'KKR', 'Chennai', false],
    ['2026-04-15', 'RCB', 'LSG', 'Bengaluru', false],
    ['2026-04-16', 'MI', 'PBKS', 'Mumbai', false],
    ['2026-04-17', 'GT', 'KKR', 'Ahmedabad', false],
    ['2026-04-18', 'RCB', 'DC', 'Bengaluru', true],
    ['2026-04-18', 'SRH', 'CSK', 'Hyderabad', false],
    ['2026-04-19', 'KKR', 'RR', 'Kolkata', true],
    ['2026-04-19', 'PBKS', 'LSG', 'New Chandigarh', false],
    ['2026-04-20', 'GT', 'MI', 'Ahmedabad', false],
    ['2026-04-21', 'SRH', 'DC', 'Hyderabad', false],
    ['2026-04-22', 'LSG', 'RR', 'Lucknow', false],
    ['2026-04-23', 'MI', 'CSK', 'Mumbai', false],
    ['2026-04-24', 'RCB', 'GT', 'Bengaluru', false],
    ['2026-04-25', 'DC', 'PBKS', 'Delhi', true],
    ['2026-04-25', 'RR', 'SRH', 'Jaipur', false],
    ['2026-04-26', 'GT', 'CSK', 'Ahmedabad', true],
    ['2026-04-26', 'LSG', 'KKR', 'Lucknow', false],
    ['2026-04-27', 'DC', 'RCB', 'Delhi', false],
    ['2026-04-28', 'PBKS', 'RR', 'New Chandigarh', false],
    ['2026-04-29', 'MI', 'SRH', 'Mumbai', false],
    ['2026-04-30', 'GT', 'RCB', 'Ahmedabad', false],
    ['2026-05-01', 'RR', 'DC', 'Jaipur', false],
    ['2026-05-02', 'CSK', 'MI', 'Chennai', false],
    ['2026-05-03', 'SRH', 'KKR', 'Hyderabad', true],
    ['2026-05-03', 'GT', 'PBKS', 'Ahmedabad', false],
    ['2026-05-04', 'MI', 'LSG', 'Mumbai', false],
    ['2026-05-05', 'DC', 'CSK', 'Delhi', false],
    ['2026-05-06', 'SRH', 'PBKS', 'Hyderabad', false],
    ['2026-05-07', 'LSG', 'RCB', 'Lucknow', false],
    ['2026-05-08', 'DC', 'KKR', 'Delhi', false],
    ['2026-05-09', 'RR', 'GT', 'Jaipur', false],
    ['2026-05-10', 'CSK', 'LSG', 'Chennai', true],
    ['2026-05-10', 'RCB', 'MI', 'Raipur', false],
    ['2026-05-11', 'PBKS', 'DC', 'Dharamshala', false],
    ['2026-05-12', 'GT', 'SRH', 'Ahmedabad', false],
    ['2026-05-13', 'RCB', 'KKR', 'Raipur', false],
    ['2026-05-14', 'PBKS', 'MI', 'Dharamshala', false],
    ['2026-05-15', 'LSG', 'CSK', 'Lucknow', false],
    ['2026-05-16', 'KKR', 'GT', 'Kolkata', false],
    ['2026-05-17', 'PBKS', 'RCB', 'Dharamshala', true],
    ['2026-05-17', 'DC', 'RR', 'Delhi', false],
    ['2026-05-18', 'CSK', 'SRH', 'Chennai', false],
    ['2026-05-19', 'RR', 'LSG', 'Jaipur', false],
    ['2026-05-20', 'KKR', 'MI', 'Kolkata', false],
    ['2026-05-21', 'CSK', 'GT', 'Chennai', false],
    ['2026-05-22', 'SRH', 'RCB', 'Hyderabad', false],
    ['2026-05-23', 'LSG', 'PBKS', 'Lucknow', false],
    ['2026-05-24', 'MI', 'RR', 'Mumbai', true],
    ['2026-05-24', 'KKR', 'DC', 'Kolkata', false]
];

function buildFixtures() {
    return rows.map(([date, t1, t2, city, afternoon]) => ({
        date,
        time: afternoon ? '3:30 PM IST' : '7:30 PM IST',
        team1: t1,
        team2: t2,
        stadium: stadiumFor(city),
        prediction: 'Pending'
    }));
}

/**
 * Insert any official fixture rows missing from Supabase. 
 * Uses upsert with onConflict to avoid duplicates and preserve 
 * existing predictions.
 */
async function ensureFixturesSynced(db) {
    const fixtures = buildFixtures();
    
    // We use onConflict on (date, team1, team2) which matches our unique index.
    // We DO NOT update 'prediction' if it already exists in the destination to avoid overwriting.
    const { error } = await db
        .from('matches')
        .upsert(fixtures, { 
            onConflict: 'date,team1,team2',
            ignoreDuplicates: true 
        });

    if (error) {
        console.error('❌ Error syncing fixtures to Supabase:', error.message);
    } else {
        console.log('✅ Fixtures synced with Supabase');
    }
}

module.exports = { buildFixtures, ensureFixturesSynced, VENUE_STADIUM };
