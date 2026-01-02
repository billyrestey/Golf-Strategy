// GHIN API Service
// Uses admin credentials to look up golfer data

let authToken = null;
let tokenExpiry = null;

// Authenticate with GHIN API
async function authenticate() {
  // Check if we have a valid token
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }

  const email = process.env.GHIN_EMAIL;
  const password = process.env.GHIN_PASSWORD;

  if (!email || !password) {
    console.error('GHIN credentials not configured');
    return null;
  }

  try {
    console.log('Authenticating with GHIN...');
    const response = await fetch('https://api2.ghin.com/api/v1/golfer_login.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        user: {
          email_or_ghin: email,
          password: password,
          remember_me: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GHIN auth failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.golfer_user && data.golfer_user.golfer_user_token) {
      authToken = data.golfer_user.golfer_user_token;
      // Token typically valid for 24 hours, refresh after 12
      tokenExpiry = Date.now() + (12 * 60 * 60 * 1000);
      console.log('GHIN authentication successful');
      return authToken;
    }

    console.error('GHIN auth response missing token:', data);
    return null;
  } catch (error) {
    console.error('GHIN auth error:', error);
    return null;
  }
}

// Look up a golfer by GHIN number
export async function lookupGHIN(ghinNumber) {
  try {
    const token = await authenticate();
    
    if (!token) {
      return { 
        success: false, 
        requiresManualEntry: true,
        error: 'GHIN service unavailable. Please enter your handicap manually.' 
      };
    }

    console.log('Looking up GHIN:', ghinNumber);
    
    // Search for golfer by GHIN number
    const response = await fetch(
      `https://api2.ghin.com/api/v1/golfers.json?golfer_id=${ghinNumber}&from_ghin=true`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GHIN lookup failed:', response.status, errorText);
      return { 
        success: false, 
        requiresManualEntry: true,
        error: 'Could not find GHIN number. Please verify and try again.' 
      };
    }

    const data = await response.json();
    console.log('GHIN lookup response:', JSON.stringify(data, null, 2));
    
    if (data.golfers && data.golfers.length > 0) {
      const golfer = data.golfers[0];
      return {
        success: true,
        golfer: {
          ghinNumber: golfer.ghin,
          firstName: golfer.first_name,
          lastName: golfer.last_name,
          fullName: `${golfer.first_name} ${golfer.last_name}`,
          handicapIndex: golfer.handicap_index,
          lowHandicapIndex: golfer.low_hi,
          club: golfer.club_name,
          association: golfer.assoc_name,
          state: golfer.state,
          status: golfer.status,
          revision_date: golfer.rev_date
        }
      };
    }

    return { 
      success: false, 
      requiresManualEntry: true,
      error: 'GHIN number not found.' 
    };

  } catch (error) {
    console.error('GHIN lookup error:', error);
    return { 
      success: false, 
      requiresManualEntry: true,
      error: 'GHIN lookup failed. Please enter your handicap manually.' 
    };
  }
}

// Get recent scores for a golfer
export async function getGHINScores(ghinNumber, limit = 20) {
  try {
    const token = await authenticate();
    
    if (!token) {
      return { 
        success: false, 
        error: 'GHIN service unavailable.' 
      };
    }

    // Get score history
    const response = await fetch(
      `https://api2.ghin.com/api/v1/golfers/${ghinNumber}/scores.json?limit=${limit}&page=1`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      console.error('GHIN scores fetch failed:', response.status);
      return { 
        success: false, 
        error: 'Could not fetch scores.' 
      };
    }

    const data = await response.json();
    
    if (data.scores) {
      const scores = data.scores.map(score => ({
        id: score.id,
        date: score.played_at,
        courseName: score.course_name,
        score: score.adjusted_gross_score,
        courseRating: score.course_rating,
        slopeRating: score.slope_rating,
        differential: score.differential,
        tees: score.tee_name,
        holes: score.number_of_holes,
        scoringType: score.score_type,
        // Stats if available
        fairwaysHit: score.fairways_hit,
        greensInRegulation: score.gir,
        putts: score.putts,
        // Hole by hole if available
        holeScores: score.hole_details || null
      }));

      return {
        success: true,
        scores: scores,
        totalScores: data.total_scores || scores.length
      };
    }

    return { 
      success: false, 
      error: 'No scores found.' 
    };

  } catch (error) {
    console.error('GHIN scores error:', error);
    return { 
      success: false, 
      error: 'Failed to fetch scores.' 
    };
  }
}

// Get detailed golfer stats
export async function getGHINStats(ghinNumber) {
  try {
    const token = await authenticate();
    
    if (!token) {
      return { success: false, error: 'GHIN service unavailable.' };
    }

    const response = await fetch(
      `https://api2.ghin.com/api/v1/golfers/${ghinNumber}.json`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Could not fetch golfer stats.' };
    }

    const data = await response.json();
    
    if (data.golfer) {
      return {
        success: true,
        stats: {
          handicapIndex: data.golfer.handicap_index,
          lowIndex: data.golfer.low_hi,
          trend: data.golfer.handicap_trend,
          scoresToCount: data.golfer.number_of_scores,
          lastRevision: data.golfer.rev_date
        }
      };
    }

    return { success: false, error: 'No stats found.' };

  } catch (error) {
    console.error('GHIN stats error:', error);
    return { success: false, error: 'Failed to fetch stats.' };
  }
}
