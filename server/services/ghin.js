// GHIN API Service
// Supports both admin lookup and user authentication for detailed scores

let adminToken = null;
let adminTokenExpiry = null;

// Authenticate with GHIN API using admin credentials (for basic lookups)
async function authenticateAdmin() {
  if (adminToken && adminTokenExpiry && Date.now() < adminTokenExpiry) {
    return adminToken;
  }

  const email = process.env.GHIN_EMAIL;
  const password = process.env.GHIN_PASSWORD;

  if (!email || !password) {
    console.error('GHIN credentials not configured');
    return null;
  }

  try {
    console.log('Authenticating with GHIN (admin)...');
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
      adminToken = data.golfer_user.golfer_user_token;
      adminTokenExpiry = Date.now() + (12 * 60 * 60 * 1000);
      console.log('GHIN admin authentication successful');
      return adminToken;
    }

    console.error('GHIN auth response missing token:', data);
    return null;
  } catch (error) {
    console.error('GHIN auth error:', error);
    return null;
  }
}

// Authenticate with user's own GHIN credentials (for detailed data access)
export async function authenticateUser(emailOrGhin, password) {
  try {
    console.log('Authenticating GHIN user...');
    const response = await fetch('https://api2.ghin.com/api/v1/golfer_login.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        user: {
          email_or_ghin: emailOrGhin,
          password: password,
          remember_me: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GHIN user auth failed:', response.status, errorText);
      return { 
        success: false, 
        error: 'Invalid GHIN credentials. Please check your email/GHIN number and password.' 
      };
    }

    const data = await response.json();
    
    if (data.golfer_user) {
      return {
        success: true,
        token: data.golfer_user.golfer_user_token,
        golfer: {
          id: data.golfer_user.golfer_id,
          ghinNumber: data.golfer_user.ghin_number || data.golfer_user.golfer_id,
          firstName: data.golfer_user.first_name,
          lastName: data.golfer_user.last_name,
          email: data.golfer_user.email,
          handicapIndex: data.golfer_user.handicap_index,
          club: data.golfer_user.club_name
        }
      };
    }

    return { success: false, error: 'Authentication failed' };
  } catch (error) {
    console.error('GHIN user auth error:', error);
    return { success: false, error: 'Failed to connect to GHIN' };
  }
}

// Get detailed scores using user's token (includes hole-by-hole when available)
export async function getDetailedScores(ghinNumber, userToken, limit = 20) {
  try {
    console.log('Fetching detailed GHIN scores for:', ghinNumber);
    
    // First get basic score list
    const scoresResponse = await fetch(
      `https://api2.ghin.com/api/v1/golfers/${ghinNumber}/scores.json?limit=${limit}&page=1`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${userToken}`
        }
      }
    );

    if (!scoresResponse.ok) {
      console.error('GHIN scores fetch failed:', scoresResponse.status);
      return { success: false, error: 'Could not fetch scores' };
    }

    const scoresData = await scoresResponse.json();
    
    if (!scoresData.scores || scoresData.scores.length === 0) {
      return { success: true, scores: [], message: 'No scores found' };
    }

    // For each score, try to get hole-by-hole details
    const detailedScores = await Promise.all(
      scoresData.scores.map(async (score) => {
        const baseScore = {
          id: score.id,
          date: score.played_at,
          courseName: score.course_name,
          courseId: score.course_id,
          totalScore: score.adjusted_gross_score,
          courseRating: score.course_rating,
          slopeRating: score.slope_rating,
          differential: score.differential,
          tees: score.tee_name,
          numberOfHoles: score.number_of_holes,
          scoreType: score.score_type,
          // Stats if available
          fairwaysHit: score.fairways_hit,
          gir: score.gir,
          putts: score.putts,
          holeScores: null
        };

        // Try to get hole-by-hole details for this score
        try {
          const detailResponse = await fetch(
            `https://api2.ghin.com/api/v1/scores/${score.id}.json`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${userToken}`
              }
            }
          );

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            if (detailData.score?.hole_scores || detailData.score?.holes) {
              baseScore.holeScores = detailData.score.hole_scores || detailData.score.holes;
              baseScore.holeDetails = detailData.score.hole_details;
            }
          }
        } catch (err) {
          // Hole details not available for this score
          console.log(`No hole details for score ${score.id}`);
        }

        return baseScore;
      })
    );

    // Also try to get course details for the home course
    const coursesPlayed = [...new Set(detailedScores.map(s => s.courseName))];
    
    return {
      success: true,
      scores: detailedScores,
      totalScores: scoresData.total_scores || detailedScores.length,
      coursesPlayed,
      scoresWithHoleData: detailedScores.filter(s => s.holeScores).length
    };

  } catch (error) {
    console.error('GHIN detailed scores error:', error);
    return { success: false, error: 'Failed to fetch detailed scores' };
  }
}

// Get course hole information (pars, yardages)
export async function getCourseDetails(courseId, userToken) {
  try {
    const response = await fetch(
      `https://api2.ghin.com/api/v1/courses/${courseId}.json`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${userToken}`
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Could not fetch course details' };
    }

    const data = await response.json();
    
    if (data.course) {
      return {
        success: true,
        course: {
          id: data.course.id,
          name: data.course.name,
          city: data.course.city,
          state: data.course.state,
          tees: data.course.tees?.map(tee => ({
            id: tee.id,
            name: tee.name,
            rating: tee.rating,
            slope: tee.slope,
            yardage: tee.yardage,
            par: tee.par,
            holes: tee.holes // Array of hole details with par, yardage per hole
          }))
        }
      };
    }

    return { success: false, error: 'Course not found' };
  } catch (error) {
    console.error('Course details error:', error);
    return { success: false, error: 'Failed to fetch course details' };
  }
}

// Look up a golfer by GHIN number (using admin credentials)

// Look up a golfer by GHIN number
export async function lookupGHIN(ghinNumber) {
  try {
    const token = await authenticateAdmin();
    
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
    const token = await authenticateAdmin();
    
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
    const token = await authenticateAdmin();
    
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
