/**
 * Test script to debug Kiosk authentication flow
 * Run: node scripts/test-auth-flow.js
 */

const PMS_AUTH_URL = process.env.PMS_AUTH_URL || 'http://localhost:8000';
const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:3000';

// Test credentials
const TEST_USER = {
  username: 'test2@gmail.com',
  password: 'Admin123!'
};

async function testPMSLogin() {
  console.log('\n=== Step 1: Test PMS Login API directly ===');
  console.log(`PMS URL: ${PMS_AUTH_URL}`);
  console.log(`Credentials: ${TEST_USER.username}`);
  
  try {
    const formData = new URLSearchParams();
    formData.append('username', TEST_USER.username);
    formData.append('password', TEST_USER.password);

    const response = await fetch(`${PMS_AUTH_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ PMS Login Failed: ${error}`);
      return null;
    }

    const data = await response.json();
    console.log('✅ PMS Login Success!');
    console.log('User:', JSON.stringify(data.user, null, 2));
    console.log('Access Token (first 50 chars):', data.access_token?.substring(0, 50) + '...');
    console.log('Expires in:', data.expires_in, 'seconds');
    
    // Check allowed_systems
    if (data.user?.allowed_systems) {
      console.log('\nAllowed Systems:', data.user.allowed_systems);
      if (data.user.allowed_systems.includes('kiosk')) {
        console.log('✅ User has kiosk access');
      } else {
        console.log('❌ User does NOT have kiosk access!');
      }
    }
    
    // Check allowed_regions
    if (data.user?.allowed_regions) {
      console.log('Allowed Regions:', data.user.allowed_regions);
    }
    
    return data;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function testPMSVerify(accessToken) {
  console.log('\n=== Step 2: Test PMS Token Verification ===');
  
  try {
    const response = await fetch(`${PMS_AUTH_URL}/api/v1/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ PMS Verify Failed: ${error}`);
      return null;
    }

    const data = await response.json();
    console.log('✅ PMS Token Valid!');
    console.log('Valid:', data.valid);
    console.log('User:', JSON.stringify(data.user, null, 2));
    
    return data;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function testKioskLoginAPI() {
  console.log('\n=== Step 3: Test Kiosk Login API ===');
  console.log(`Kiosk URL: ${KIOSK_URL}`);
  
  try {
    const response = await fetch(`${KIOSK_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: TEST_USER.username,
        password: TEST_USER.password,
      }),
      redirect: 'manual', // Don't follow redirects
    });

    console.log(`Status: ${response.status}`);
    
    // Check Set-Cookie headers
    const setCookies = response.headers.getSetCookie?.() || [];
    console.log('\nCookies being set:');
    if (setCookies.length === 0) {
      console.log('  (no Set-Cookie headers found)');
    } else {
      setCookies.forEach((cookie, i) => {
        // Parse cookie name and check if it has a value
        const cookieName = cookie.split('=')[0];
        const cookieValue = cookie.split('=')[1]?.split(';')[0];
        const hasValue = cookieValue && cookieValue.length > 0 && cookieValue !== '';
        console.log(`  ${i + 1}. ${cookieName}: ${hasValue ? '✅ has value' : '❌ EMPTY'}`);
      });
    }
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ Kiosk Login Failed: ${error}`);
      return null;
    }

    const data = await response.json();
    console.log('\n✅ Kiosk Login API Response:');
    console.log(JSON.stringify(data, null, 2));
    
    return { data, cookies: setCookies };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

async function testKioskPage(cookies, path) {
  console.log(`\n=== Step 4: Test ${path} Access ===`);
  
  try {
    // Build cookie header from Set-Cookie values
    const cookieHeader = cookies
      .map(c => c.split(';')[0]) // Get just the name=value part
      .join('; ');
    
    console.log('Cookie names:', cookies.map(c => c.split('=')[0]).join(', '));
    
    // Find the session_token
    const sessionCookie = cookies.find(c => c.startsWith('session_token='));
    if (sessionCookie) {
      const token = sessionCookie.split(';')[0].split('=')[1];
      console.log('Session token (first 80 chars):', token.substring(0, 80) + '...');
    }
    
    const response = await fetch(`${KIOSK_URL}${path}`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
      },
      redirect: 'manual',
    });

    console.log(`Status: ${response.status}`);
    console.log(`Location header: ${response.headers.get('location') || '(none)'}`);
    
    if (response.status === 200) {
      console.log(`✅ ${path} accessible!`);
      return true;
    } else if (response.status === 307 || response.status === 302) {
      const location = response.headers.get('location');
      if (location?.includes('/login')) {
        console.log('❌ Redirected to login - session not recognized');
        console.log('Redirect URL:', location);
      } else {
        console.log(`⚠️ Redirected to: ${location}`);
      }
      return false;
    } else {
      console.log(`⚠️ Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function checkKioskHealth() {
  console.log('\n=== Step 0: Check Kiosk Server Health ===');
  
  try {
    const response = await fetch(`${KIOSK_URL}/login`, {
      method: 'GET',
      redirect: 'manual',
    });
    
    console.log(`Kiosk /login status: ${response.status}`);
    if (response.status === 200) {
      console.log('✅ Kiosk server is running');
      return true;
    } else {
      console.log(`⚠️ Unexpected status: ${response.status}`);
      return true; // Still running, might just redirect
    }
  } catch (error) {
    console.log(`❌ Kiosk server not reachable: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('   Kiosk Authentication Flow Debugger');
  console.log('========================================');
  
  // Step 0: Check servers
  const kioskHealthy = await checkKioskHealth();
  if (!kioskHealthy) {
    console.log('\n❌ Cannot continue - Kiosk server not running');
    console.log('Make sure to run: docker compose up -d');
    return;
  }
  
  // Step 1: Test PMS login directly
  const pmsResult = await testPMSLogin();
  if (!pmsResult) {
    console.log('\n❌ Cannot continue - PMS login failed');
    console.log('Make sure PMS is running: python -m app.main');
    return;
  }
  
  // Step 2: Test PMS token verification
  const verifyResult = await testPMSVerify(pmsResult.access_token);
  if (!verifyResult) {
    console.log('\n❌ PMS token verification failed');
  }
  
  // Step 3: Test Kiosk login API
  const kioskResult = await testKioskLoginAPI();
  if (!kioskResult) {
    console.log('\n❌ Kiosk login API failed');
    return;
  }
  
  // Step 4: Test correct page based on redirectUrl
  if (kioskResult.cookies.length > 0) {
    const redirectUrl = kioskResult.data.redirectUrl || '/dashboard';
    await testKioskPage(kioskResult.cookies, redirectUrl);
  } else {
    console.log('\n⚠️ No cookies received from login - cannot test page access');
  }
  
  console.log('\n========================================');
  console.log('   Debug Summary');
  console.log('========================================');
  console.log('If you see redirect loops, check:');
  console.log('1. session_token cookie is being set');
  console.log('2. user_role cookie is being set');
  console.log('3. JWT_SECRET in Kiosk matches what was used to sign');
  console.log('4. Middleware is validating the correct cookie');
}

main().catch(console.error);
