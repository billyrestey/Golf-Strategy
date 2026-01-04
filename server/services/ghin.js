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
          remember_me: 'true'
        },
        token: 'golfstrategy'  // Required arbitrary token
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
    console.log('Authenticating GHIN user:', emailOrGhin);
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
          remember_me: 'true'
        },
        token: 'golfstrategy'  // Required arbitrary token
      })
    });

    const responseText = await response.text();
    console.log('GHIN auth response status:', response.status);

    if (!response.ok) {
      let errorMsg = 'Invalid GHIN credentials. Please check your email/GHIN number and password.';
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.errors) {
          errorMsg = Object.values(errorData.errors).flat().join(', ');
        } else if (errorData.error || errorData.message) {
          errorMsg = errorData.error || errorData.message;
        }
      } catch (e) {
        // Use default error message
      }
      return { success: false, error: errorMsg };
    }

    const data = JSON.parse(responseText);
    console.log('GHIN response keys:', Object.keys(data));
    
    if (data.golfer_user) {
      console.log('golfer_user keys:', Object.keys(data.golfer_user));
      
      // Get golfer info from golfers array (this is where the real data is)
      const golfers = data.golfer_user.golfers || [];
      console.log('Number of golfers:', golfers.length);
      
      const primaryGolfer = golfers[0] || {};
      console.log('Primary golfer keys:', Object.keys(primaryGolfer));
      console.log('Primary golfer data:', JSON.stringify({
        player_name: primaryGolfer.player_name,
        ghin_number: primaryGolfer.ghin_number,
        handicap_index: primaryGolfer.handicap_index,
        display: primaryGolfer.display,
        club_name: primaryGolfer.club_name
      }));
      
      // handicap_index might be in 'display' field as string like "15.2"
      const handicapValue = primaryGolfer.handicap_index || 
                           primaryGolfer.display || 
                           data.golfer_user.handicap_index;
      
      console.log('Extracted handicap:', handicapValue);
      
      return {
        success: true,
        token: data.golfer_user.golfer_user_token,
        golfer: {
          id: primaryGolfer.id || data.golfer_user.golfer_id,
          ghinNumber: primaryGolfer.ghin_number || data.golfer_user.ghin_number || data.golfer_user.golfer_id,
          firstName: data.golfer_user.first_name || primaryGolfer.first_name,
          lastName: data.golfer_user.last_name || primaryGolfer.last_name,
          playerName: primaryGolfer.player_name,
          email: data.golfer_user.email,
          handicapIndex: handicapValue,
          lowHandicapIndex: primaryGolfer.low_hi_display || primaryGolfer.low_hi,
          club: primaryGolfer.club_name || data.golfer_user.club_name,
          association: primaryGolfer.golf_association_name,
          softCap: primaryGolfer.soft_cap,
          hardCap: primaryGolfer.hard_cap
        },
        // Include any scores that came with the login response
        recentScores: primaryGolfer.recent_scores || []
      };
    }

    return { success: false, error: 'Authentication failed - no user data returned' };
  } catch (error) {
    console.error('GHIN user auth error:', error);
    return { success: false, error: 'Failed to connect to GHIN. Please try again.' };
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
    console.log('Raw GHIN scores response keys:', Object.keys(scoresData));
    
    // GHIN returns scores in 'recent_scores', not 'scores'
    const rawScores = scoresData.recent_scores || scoresData.scores || [];
    console.log('Number of scores found:', rawScores.length);
    
    if (rawScores.length === 0) {
      return { success: true, scores: [], message: 'No scores found' };
    }

    // Log first score to see available fields
    if (rawScores[0]) {
      console.log('Sample score fields:', Object.keys(rawScores[0]));
      console.log('Sample score data:', JSON.stringify({
        course_name: rawScores[0].course_name,
        facility_name: rawScores[0].facility_name,
        adjusted_gross_score: rawScores[0].adjusted_gross_score,
        differential: rawScores[0].differential
      }));
    }

    // For each score, try to get hole-by-hole details
    const detailedScores = await Promise.all(
      rawScores.slice(0, limit).map(async (score) => {
        const baseScore = {
          id: score.id,
          date: score.played_at,
          courseName: score.course_name || score.facility_name,
          facilityName: score.facility_name || score.course_name,
          courseId: score.course_id,
          totalScore: score.adjusted_gross_score,
          rawScore: score.raw_score,
          courseRating: score.course_rating,
          slopeRating: score.slope_rating,
          differential: score.differential,
          tees: score.tee_name,
          numberOfHoles: score.number_of_holes,
          scoreType: score.score_type,
          
          // Round stats (if user entered them)
          fairwaysHit: score.fairways_hit,
          fairwaysPossible: score.fairways_possible,
          greensInRegulation: score.gir || score.greens_in_regulation,
          girPossible: score.gir_possible,
          putts: score.putts,
          penalties: score.penalties,
          
          // Hole-by-hole data
          holeDetails: null
        };

        // Check if hole_details came with the score list
        if (score.hole_details && score.hole_details.length > 0) {
          baseScore.holeDetails = extractHoleDetails(score.hole_details);
          console.log(`Score ${score.id} has ${score.hole_details.length} hole details inline`);
        } else {
          // Try to fetch hole-by-hole details for this score
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
              const holes = detailData.score?.hole_details || 
                           detailData.score?.holes || 
                           detailData.hole_details;
              if (holes && holes.length > 0) {
                baseScore.holeDetails = extractHoleDetails(holes);
                console.log(`Score ${score.id} fetched ${holes.length} hole details`);
              }
            }
          } catch (err) {
            // Hole details not available for this score
          }
        }

        return baseScore;
      })
    );

    // Aggregate stats across all rounds for analysis
    const aggregateStats = calculateAggregateStats(detailedScores);

    return {
      success: true,
      scores: detailedScores,
      totalScores: scoresData.total_scores || detailedScores.length,
      coursesPlayed: [...new Set(detailedScores.map(s => s.courseName))],
      scoresWithHoleData: detailedScores.filter(s => s.holeDetails).length,
      aggregateStats
    };

  } catch (error) {
    console.error('GHIN detailed scores error:', error);
    return { success: false, error: 'Failed to fetch detailed scores' };
  }
}

// Extract and normalize hole details
function extractHoleDetails(holes) {
  return holes.map(hole => ({
    holeNumber: hole.hole_number,
    par: hole.par,
    yardage: hole.yardage,
    score: hole.raw_score || hole.adjusted_gross_score || hole.score,
    adjustedScore: hole.adjusted_gross_score,
    
    // Shot-by-shot stats (if entered by user)
    fairwayHit: hole.fairway_hit,           // true/false/null
    fairwayMiss: hole.fairway_miss,         // 'left', 'right', 'short', null
    greenInRegulation: hole.gir,            // true/false
    greenMiss: hole.green_miss,             // 'left', 'right', 'short', 'long', null
    putts: hole.putts,
    penalties: hole.penalties,
    
    // Sand/bunker
    sandShots: hole.sand_shots,
    sandSaves: hole.sand_save,
    
    // Calculated
    overUnder: (hole.raw_score || hole.adjusted_gross_score) - hole.par
  }));
}

// Calculate aggregate statistics for analysis
function calculateAggregateStats(scores) {
  const stats = {
    totalRounds: scores.length,
    averageScore: 0,
    averageDifferential: 0,
    
    // Hole-by-hole patterns (only from rounds with detail)
    holePatterns: {},         // hole number -> average over/under
    troubleHoles: [],         // holes consistently over par
    birdieHoles: [],          // holes with birdie opportunities
    
    // Miss patterns
    fairwayMissLeft: 0,
    fairwayMissRight: 0,
    greenMissShort: 0,
    greenMissLong: 0,
    greenMissLeft: 0,
    greenMissRight: 0,
    
    // Overall stats
    avgFairwaysHit: null,
    avgGIR: null,
    avgPutts: null,
    
    // Course-specific data
    courseStats: {}
  };

  if (scores.length === 0) return stats;

  // Calculate averages
  stats.averageScore = scores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / scores.length;
  stats.averageDifferential = scores.reduce((sum, s) => sum + (s.differential || 0), 0) / scores.length;

  // Process hole-by-hole data
  const scoresWithHoles = scores.filter(s => s.holeDetails && s.holeDetails.length > 0);
  
  if (scoresWithHoles.length > 0) {
    // Aggregate hole patterns
    const holeData = {};
    let totalFairwayMissLeft = 0, totalFairwayMissRight = 0;
    let totalGreenMissShort = 0, totalGreenMissLong = 0;
    let totalGreenMissLeft = 0, totalGreenMissRight = 0;
    let missCount = 0;

    scoresWithHoles.forEach(score => {
      const courseName = score.courseName;
      
      // Initialize course stats
      if (!stats.courseStats[courseName]) {
        stats.courseStats[courseName] = {
          rounds: 0,
          avgScore: 0,
          holeAverages: {}
        };
      }
      stats.courseStats[courseName].rounds++;

      score.holeDetails.forEach(hole => {
        const holeNum = hole.holeNumber;
        
        // Track hole performance
        if (!holeData[holeNum]) {
          holeData[holeNum] = { total: 0, count: 0, par: hole.par };
        }
        if (hole.score) {
          holeData[holeNum].total += hole.overUnder;
          holeData[holeNum].count++;
        }

        // Track miss patterns
        if (hole.fairwayMiss === 'left') totalFairwayMissLeft++;
        if (hole.fairwayMiss === 'right') totalFairwayMissRight++;
        if (hole.greenMiss === 'short') totalGreenMissShort++;
        if (hole.greenMiss === 'long') totalGreenMissLong++;
        if (hole.greenMiss === 'left') totalGreenMissLeft++;
        if (hole.greenMiss === 'right') totalGreenMissRight++;
        if (hole.fairwayMiss || hole.greenMiss) missCount++;

        // Course-specific hole averages
        if (!stats.courseStats[courseName].holeAverages[holeNum]) {
          stats.courseStats[courseName].holeAverages[holeNum] = { total: 0, count: 0, par: hole.par };
        }
        if (hole.score) {
          stats.courseStats[courseName].holeAverages[holeNum].total += hole.score;
          stats.courseStats[courseName].holeAverages[holeNum].count++;
        }
      });
    });

    // Calculate hole patterns
    Object.entries(holeData).forEach(([holeNum, data]) => {
      if (data.count > 0) {
        const avgOverUnder = data.total / data.count;
        stats.holePatterns[holeNum] = {
          avgOverUnder: Math.round(avgOverUnder * 100) / 100,
          par: data.par,
          sampleSize: data.count
        };
        
        // Identify trouble holes (avg > +0.5 over par)
        if (avgOverUnder > 0.5) {
          stats.troubleHoles.push({ hole: parseInt(holeNum), avgOver: avgOverUnder, par: data.par });
        }
        // Identify birdie opportunities (avg < +0.3)
        if (avgOverUnder < 0.3 && data.par >= 4) {
          stats.birdieHoles.push({ hole: parseInt(holeNum), avgOver: avgOverUnder, par: data.par });
        }
      }
    });

    // Sort trouble holes by severity
    stats.troubleHoles.sort((a, b) => b.avgOver - a.avgOver);
    stats.birdieHoles.sort((a, b) => a.avgOver - b.avgOver);

    // Calculate miss pattern percentages
    if (missCount > 0) {
      stats.fairwayMissLeft = Math.round((totalFairwayMissLeft / missCount) * 100);
      stats.fairwayMissRight = Math.round((totalFairwayMissRight / missCount) * 100);
      stats.greenMissShort = Math.round((totalGreenMissShort / missCount) * 100);
      stats.greenMissLong = Math.round((totalGreenMissLong / missCount) * 100);
      stats.greenMissLeft = Math.round((totalGreenMissLeft / missCount) * 100);
      stats.greenMissRight = Math.round((totalGreenMissRight / missCount) * 100);
    }

    // Course-specific averages
    Object.values(stats.courseStats).forEach(course => {
      Object.entries(course.holeAverages).forEach(([hole, data]) => {
        if (data.count > 0) {
          course.holeAverages[hole] = {
            avgScore: Math.round((data.total / data.count) * 10) / 10,
            par: data.par,
            avgOverUnder: Math.round(((data.total / data.count) - data.par) * 10) / 10
          };
        }
      });
    });
  }

  // Calculate overall stats from round-level data
  const roundsWithFairways = scores.filter(s => s.fairwaysHit != null);
  const roundsWithGIR = scores.filter(s => s.greensInRegulation != null);
  const roundsWithPutts = scores.filter(s => s.putts != null);

  if (roundsWithFairways.length > 0) {
    stats.avgFairwaysHit = Math.round(roundsWithFairways.reduce((sum, s) => sum + s.fairwaysHit, 0) / roundsWithFairways.length * 10) / 10;
  }
  if (roundsWithGIR.length > 0) {
    stats.avgGIR = Math.round(roundsWithGIR.reduce((sum, s) => sum + s.greensInRegulation, 0) / roundsWithGIR.length * 10) / 10;
  }
  if (roundsWithPutts.length > 0) {
    stats.avgPutts = Math.round(roundsWithPutts.reduce((sum, s) => sum + s.putts, 0) / roundsWithPutts.length * 10) / 10;
  }

  return stats;
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
