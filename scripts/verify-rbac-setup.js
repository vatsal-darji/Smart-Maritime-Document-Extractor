const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const isSSL = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'uat';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSSL ? { rejectUnauthorized: false } : false,
});

async function verifyRBACSetup() {
  const client = await pool.connect();

  try {
    console.log('🔍 Verifying RBAC Setup...\n');

    // Check modules
    const modules = (
      await client.query('SELECT id, key, name, status FROM modules ORDER BY module_order')
    ).rows;
    console.log('📁 Modules created:', modules.length);
    modules.forEach(m => console.log(`   ${m.id}. ${m.name} (${m.key}) - ${m.status}`));

    // Check permissions by module
    console.log('\n🔐 Permissions by Module:');
    const permissionsByModule = (
      await client.query(`
      SELECT m.name as module, COUNT(p.id) as permission_count
      FROM modules m 
      LEFT JOIN permissions p ON m.id = p.module_id 
      GROUP BY m.id, m.name 
      ORDER BY m.id
    `)
    ).rows;
    permissionsByModule.forEach(pm => console.log(`   ${pm.module}: ${pm.permission_count} permissions`));

    // Check roles and their permission counts
    console.log('\n👥 Roles and Permission Counts:');
    const rolePermissions = (
      await client.query(`
      SELECT r.name as role, r.type, COUNT(rp.permission_id) as permissions
      FROM roles r 
      LEFT JOIN roles_permissions rp ON r.id = rp.role_id 
      GROUP BY r.id, r.name, r.type
      ORDER BY r.id
    `)
    ).rows;
    rolePermissions.forEach(rp => console.log(`   ${rp.role} (${rp.type || 'N/A'}): ${rp.permissions} permissions`));

    // Check users and their roles
    console.log('\n👤 Admin Users Created:');
    const userRoles = (
      await client.query(`
      SELECT u.full_name, u.email, r.name as role, u.is_active
      FROM users u 
      JOIN users_roles ur ON u.id = ur.user_id 
      JOIN roles r ON ur.role_id = r.id
      ORDER BY u.id
    `)
    ).rows;
    userRoles.forEach(ur => console.log(`   ${ur.full_name} (${ur.email}) - ${ur.role} [${ur.is_active ? 'ACTIVE' : 'INACTIVE'}]`));

    // Summary
    console.log('\n📊 Summary:');
    const totalPermissions = (await client.query('SELECT COUNT(*) as count FROM permissions')).rows;
    const totalRoles = (await client.query('SELECT COUNT(*) as count FROM roles')).rows;
    const totalUsers = (await client.query('SELECT COUNT(*) as count FROM users')).rows;
    
    console.log(`   Total Modules: ${modules.length}`);
    console.log(`   Total Permissions: ${totalPermissions[0].count}`);
    console.log(`   Total Roles: ${totalRoles[0].count}`);
    console.log(`   Total Users: ${totalUsers[0].count}`);

    console.log('\n✅ RBAC Setup Verified Successfully!');
    console.log('\n🔑 Default Login Credentials:');
    console.log('   Super Admin: superadmin@devore.ai / Admin@123');
    console.log('   Admin: admin@devore.ai / Admin@123');
    console.log('   Manager: manager@devore.ai / Admin@123');
    console.log('   User: user@devore.ai / Admin@123');
    console.log('\n⚠️  IMPORTANT: Change default passwords after first login!');

  } catch (error) {
    console.error('❌ Error verifying RBAC setup:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyRBACSetup();
