const db = require('../db');

async function checkAdmin() {
    try {
        const { data, error } = await db
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (error) {
            console.error('❌ Error checking admin:', error.message);
            if (error.code === 'PGRST116') {
                console.log('💡 Admin user not found. I will attempt to create it.');
                const { error: insertErr } = await db
                    .from('users')
                    .insert({ username: 'admin', password: 'password123', display_name: 'Admin' });
                
                if (insertErr) console.error('❌ Failed to create admin:', insertErr.message);
                else console.log('✅ Admin user created successfully.');
            }
        } else {
            console.log('✅ Admin user exists:', data);
        }
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
    }
}

checkAdmin();
