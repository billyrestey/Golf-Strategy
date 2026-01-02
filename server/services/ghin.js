// Handicap Tracking Service
// Note: GHIN's API requires authentication, so we can't do public lookups
// Instead, we'll track handicap history manually and let users update it

// Try to look up GHIN (this will likely fail without auth, but worth trying)
export async function lookupGHIN(ghinNumber) {
  try {
    // Try the public-facing API that the GHIN website uses
    // This may or may not work depending on GHIN's current security
    const response = await fetch(
      `https://api2.ghin.com/api/v1/public/login.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          user: {
            email_or_ghin: ghinNumber,
            remember_me: false
          }
        })
      }
    );

    // If we get here, check if there's useful data
    // Most likely this will require full auth
    if (!response.ok) {
      // Fall back to returning a "manual entry required" response
      return { 
        success: false, 
        requiresManualEntry: true,
        error: 'GHIN lookup requires authentication. Please enter your handicap manually.' 
      };
    }

    const data = await response.json();
    return { success: false, requiresManualEntry: true };
    
  } catch (error) {
    console.error('GHIN lookup error:', error);
    return { 
      success: false, 
      requiresManualEntry: true,
      error: 'GHIN lookup unavailable. Please enter your handicap manually.' 
    };
  }
}

// For now, we'll just return the manual entry prompt
export async function getGHINScores(ghinNumber) {
  return { 
    success: false, 
    requiresManualEntry: true,
    error: 'Score history requires GHIN authentication.' 
  };
}
