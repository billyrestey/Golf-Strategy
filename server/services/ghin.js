// GHIN API Service
// Supports both admin lookup and user authentication for detailed scores

let adminToken = null;
let adminTokenExpiry = null;

// Authenticate with GHIN API using admin credentials (for basic lookups)
export async function authenticateAdmin() {
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
    const response = await fetch('https://api.ghin.com/api/v1/golfer_login.json', {
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
    const response = await fetch('https://api.ghin.com/api/v1/golfer_login.json', {
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
          ghinNumber: primaryGolfer.ghin || primaryGolfer.ghin_number || data.golfer_user.ghin_number || data.golfer_user.golfer_id,
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
export async function getDetailedScores(ghinNumber, userToken, limit = 20, homeCourseOnly = true) {
  try {
    console.log('Fetching detailed GHIN scores for:', ghinNumber);
    
    // Use the correct API endpoint
    const today = new Date().toISOString().split('T')[0];
    const lastYear = new Date(Date.now() - 365*24*60*60*1000).toISOString().split('T')[0];
    const scoresUrl = `https://api.ghin.com/api/v1/scores/search.json?per_page=${limit}&page=1&golfer_id=${ghinNumber}&from_date_played=${lastYear}&to_date_played=${today}`;

    let rawScores = [];
    
    try {
      console.log('Trying scores URL:', scoresUrl);
      const scoresResponse = await fetch(scoresUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${userToken}`
        }
      });

      console.log('Scores response status:', scoresResponse.status);

      if (scoresResponse.ok) {
        const scoresData = await scoresResponse.json();
        console.log('Scores data keys:', Object.keys(scoresData));
        
        // GHIN API returns 'Scores' with capital S
        rawScores = scoresData.Scores || scoresData.scores || scoresData.recent_scores || [];
        console.log('Total scores found:', rawScores.length);
      }
    } catch (urlErr) {
      console.error('Error fetching scores:', urlErr.message);
    }
    
    if (rawScores.length === 0) {
      return { success: true, scores: [], message: 'No scores found', homeCourse: null };
    }

    // Detect home course (most played course)
    const courseCounts = {};
    const courseIds = {}; // Track course IDs
    rawScores.forEach(s => {
      const courseName = s.facility_name || s.course_name;
      if (courseName) {
        courseCounts[courseName] = (courseCounts[courseName] || 0) + 1;
        if (s.course_id && !courseIds[courseName]) {
          courseIds[courseName] = s.course_id;
        }
      }
    });
    
    const sortedCourses = Object.entries(courseCounts).sort((a, b) => b[1] - a[1]);
    const homeCourse = sortedCourses[0]?.[0] || null;
    const homeCoursePlays = sortedCourses[0]?.[1] || 0;
    const homeCourseId = homeCourse ? courseIds[homeCourse] : null;
    
    console.log('Detected home course:', homeCourse, `(${homeCoursePlays} rounds, ID: ${homeCourseId})`);
    console.log('All courses:', sortedCourses.slice(0, 5).map(c => `${c[0]}: ${c[1]}`).join(', '));

    // Filter to home course if requested and we have enough rounds there
    let scoresToProcess = rawScores;
    if (homeCourseOnly && homeCourse && homeCoursePlays >= 5) {
      scoresToProcess = rawScores.filter(s => 
        (s.facility_name || s.course_name) === homeCourse
      );
      console.log(`Filtered to home course: ${scoresToProcess.length} rounds`);
    } else if (homeCourseOnly && homeCoursePlays < 5) {
      console.log('Not enough home course rounds, using all courses');
    }

    // Cap at limit (default 20)
    scoresToProcess = scoresToProcess.slice(0, limit);
    console.log(`Processing ${scoresToProcess.length} scores (limit: ${limit})`);

    // For each score, extract the data we need
    const detailedScores = scoresToProcess.map(score => {
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
        
        // Hole-by-hole data (if available)
        holeDetails: score.hole_details ? extractHoleDetails(score.hole_details) : null
      };

      return baseScore;
    });

    // Aggregate stats across all rounds for analysis
    const aggregateStats = calculateAggregateStats(detailedScores);
    
    // Extract course layout from score data (pars and yardages per hole)
    // This gives us real course info even if GHIN API doesn't return hole details
    const courseLayoutFromScores = extractCourseLayoutFromScores(detailedScores, homeCourse);

    return {
      success: true,
      scores: detailedScores,
      totalScores: rawScores.length,
      homeCourse,
      homeCourseId,
      homeCoursePlays,
      coursesPlayed: sortedCourses.map(c => ({ name: c[0], count: c[1] })),
      scoresWithHoleData: detailedScores.filter(s => s.holeDetails).length,
      aggregateStats,
      courseLayoutFromScores
    };

  } catch (error) {
    console.error('GHIN detailed scores error:', error);
    return { success: false, error: 'Failed to fetch detailed scores' };
  }
}

// Extract course layout (pars, yardages) from score records
function extractCourseLayoutFromScores(scores, targetCourse) {
  // Filter to scores from the target course that have hole details
  const relevantScores = scores.filter(s => 
    s.holeDetails && 
    s.holeDetails.length > 0 &&
    (s.courseName === targetCourse || s.facilityName === targetCourse)
  );
  
  if (relevantScores.length === 0) {
    console.log('No scores with hole details for course layout extraction');
    return null;
  }
  
  console.log(`Extracting course layout from ${relevantScores.length} rounds with hole data`);
  
  // Build hole info from scores - use most recent complete round
  // or aggregate from multiple rounds
  const holeInfo = {};
  
  relevantScores.forEach(score => {
    score.holeDetails.forEach(hole => {
      const holeNum = hole.holeNumber;
      if (!holeInfo[holeNum]) {
        holeInfo[holeNum] = {
          holeNumber: holeNum,
          par: hole.par,
          yardage: hole.yardage,
          scores: [],
          avgScore: 0
        };
      }
      // Update with latest par/yardage if we have it
      if (hole.par) holeInfo[holeNum].par = hole.par;
      if (hole.yardage) holeInfo[holeNum].yardage = hole.yardage;
      if (hole.score) holeInfo[holeNum].scores.push(hole.score);
    });
  });
  
  // Convert to array and calculate averages
  const holes = Object.values(holeInfo)
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .map(h => ({
      holeNumber: h.holeNumber,
      par: h.par,
      yardage: h.yardage || null,
      avgScore: h.scores.length > 0 
        ? (h.scores.reduce((a, b) => a + b, 0) / h.scores.length).toFixed(1)
        : null,
      roundsPlayed: h.scores.length
    }));
  
  if (holes.length === 0) {
    return null;
  }
  
  const totalPar = holes.reduce((sum, h) => sum + (h.par || 0), 0);
  const totalYards = holes.reduce((sum, h) => sum + (h.yardage || 0), 0);
  
  console.log(`Extracted layout: ${holes.length} holes, par ${totalPar}, ${totalYards} yards`);
  
  return {
    courseName: targetCourse,
    holes,
    totalPar,
    totalYards: totalYards > 0 ? totalYards : null,
    holesWithPar: holes.filter(h => h.par).length,
    holesWithYardage: holes.filter(h => h.yardage).length,
    source: 'scores'
  };
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

    // Par-type analysis
    parTypePerformance: {
      par3: { avgScore: null, avgOverUnder: null, count: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0 },
      par4: { avgScore: null, avgOverUnder: null, count: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0 },
      par5: { avgScore: null, avgOverUnder: null, count: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0 }
    },

    // Scoring distribution overall
    scoringDistribution: {
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubles: 0,
      triples: 0,
      worse: 0
    },

    // Approach play analysis
    approachAnalysis: {
      girPercentage: null,
      girOnPar3: null,
      girOnPar4: null,
      girOnPar5: null,
      greenMissPatterns: { short: 0, long: 0, left: 0, right: 0, total: 0 }
    },

    // Short game analysis
    shortGameAnalysis: {
      avgPuttsPerRound: null,
      avgPuttsPerGIR: null,        // putts when hitting green
      avgPuttsPerMissedGIR: null,  // scrambling putts
      upAndDownRate: null,
      sandSaveRate: null
    },

    // Penalty analysis
    penaltyAnalysis: {
      avgPenaltiesPerRound: null,
      holesWithPenalties: [],
      penaltyStrokesLost: 0
    },

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

    // Par-type tracking
    const parTypeData = {
      3: { scores: [], girs: 0, attempts: 0 },
      4: { scores: [], girs: 0, attempts: 0 },
      5: { scores: [], girs: 0, attempts: 0 }
    };

    // Short game tracking
    let totalPuttsOnGIR = 0, girHolesWithPutts = 0;
    let totalPuttsOnMissedGIR = 0, missedGIRHolesWithPutts = 0;
    let upAndDownAttempts = 0, upAndDownSuccesses = 0;
    let sandAttempts = 0, sandSaves = 0;

    // Penalty tracking
    let totalPenalties = 0;
    const penaltyHoles = {};

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
        const par = hole.par;

        // Track hole performance
        if (!holeData[holeNum]) {
          holeData[holeNum] = { total: 0, count: 0, par: hole.par };
        }
        if (hole.score) {
          holeData[holeNum].total += hole.overUnder;
          holeData[holeNum].count++;

          // Par-type performance tracking
          if (par >= 3 && par <= 5 && parTypeData[par]) {
            parTypeData[par].scores.push(hole.score);
            const overUnder = hole.score - par;

            // Track scoring distribution by par type
            if (overUnder <= -2) stats.scoringDistribution.eagles++;
            else if (overUnder === -1) {
              stats.scoringDistribution.birdies++;
              stats.parTypePerformance[`par${par}`].birdies++;
            }
            else if (overUnder === 0) {
              stats.scoringDistribution.pars++;
              stats.parTypePerformance[`par${par}`].pars++;
            }
            else if (overUnder === 1) {
              stats.scoringDistribution.bogeys++;
              stats.parTypePerformance[`par${par}`].bogeys++;
            }
            else if (overUnder === 2) {
              stats.scoringDistribution.doubles++;
              stats.parTypePerformance[`par${par}`].doubles++;
            }
            else if (overUnder === 3) {
              stats.scoringDistribution.triples++;
              stats.parTypePerformance[`par${par}`].triples++;
            }
            else {
              stats.scoringDistribution.worse++;
            }
          }

          // GIR tracking by par type
          if (hole.greenInRegulation !== null && par >= 3 && par <= 5) {
            parTypeData[par].attempts++;
            if (hole.greenInRegulation) {
              parTypeData[par].girs++;
            }
          }
        }

        // Track miss patterns
        if (hole.fairwayMiss === 'left') totalFairwayMissLeft++;
        if (hole.fairwayMiss === 'right') totalFairwayMissRight++;
        if (hole.greenMiss === 'short') {
          totalGreenMissShort++;
          stats.approachAnalysis.greenMissPatterns.short++;
        }
        if (hole.greenMiss === 'long') {
          totalGreenMissLong++;
          stats.approachAnalysis.greenMissPatterns.long++;
        }
        if (hole.greenMiss === 'left') {
          totalGreenMissLeft++;
          stats.approachAnalysis.greenMissPatterns.left++;
        }
        if (hole.greenMiss === 'right') {
          totalGreenMissRight++;
          stats.approachAnalysis.greenMissPatterns.right++;
        }
        if (hole.greenMiss) {
          stats.approachAnalysis.greenMissPatterns.total++;
        }
        if (hole.fairwayMiss || hole.greenMiss) missCount++;

        // Putting analysis - GIR vs missed GIR
        if (hole.putts != null) {
          if (hole.greenInRegulation === true) {
            totalPuttsOnGIR += hole.putts;
            girHolesWithPutts++;
          } else if (hole.greenInRegulation === false) {
            totalPuttsOnMissedGIR += hole.putts;
            missedGIRHolesWithPutts++;
            // Up and down = missed GIR but still made par or better
            upAndDownAttempts++;
            if (hole.score <= par) {
              upAndDownSuccesses++;
            }
          }
        }

        // Sand save tracking
        if (hole.sandShots && hole.sandShots > 0) {
          sandAttempts++;
          if (hole.sandSave === true || hole.score <= par) {
            sandSaves++;
          }
        }

        // Penalty tracking
        if (hole.penalties && hole.penalties > 0) {
          totalPenalties += hole.penalties;
          if (!penaltyHoles[holeNum]) {
            penaltyHoles[holeNum] = { count: 0, totalPenalties: 0 };
          }
          penaltyHoles[holeNum].count++;
          penaltyHoles[holeNum].totalPenalties += hole.penalties;
        }

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

    // Calculate par-type performance averages
    [3, 4, 5].forEach(par => {
      const data = parTypeData[par];
      if (data.scores.length > 0) {
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        stats.parTypePerformance[`par${par}`].avgScore = Math.round(avgScore * 100) / 100;
        stats.parTypePerformance[`par${par}`].avgOverUnder = Math.round((avgScore - par) * 100) / 100;
        stats.parTypePerformance[`par${par}`].count = data.scores.length;
      }
      if (data.attempts > 0) {
        stats.approachAnalysis[`girOnPar${par}`] = Math.round((data.girs / data.attempts) * 100);
      }
    });

    // Calculate approach analysis
    const totalGIRAttempts = parTypeData[3].attempts + parTypeData[4].attempts + parTypeData[5].attempts;
    const totalGIRs = parTypeData[3].girs + parTypeData[4].girs + parTypeData[5].girs;
    if (totalGIRAttempts > 0) {
      stats.approachAnalysis.girPercentage = Math.round((totalGIRs / totalGIRAttempts) * 100);
    }

    // Calculate short game stats
    if (girHolesWithPutts > 0) {
      stats.shortGameAnalysis.avgPuttsPerGIR = Math.round((totalPuttsOnGIR / girHolesWithPutts) * 100) / 100;
    }
    if (missedGIRHolesWithPutts > 0) {
      stats.shortGameAnalysis.avgPuttsPerMissedGIR = Math.round((totalPuttsOnMissedGIR / missedGIRHolesWithPutts) * 100) / 100;
    }
    if (upAndDownAttempts > 0) {
      stats.shortGameAnalysis.upAndDownRate = Math.round((upAndDownSuccesses / upAndDownAttempts) * 100);
    }
    if (sandAttempts > 0) {
      stats.shortGameAnalysis.sandSaveRate = Math.round((sandSaves / sandAttempts) * 100);
    }

    // Calculate penalty stats
    if (scoresWithHoles.length > 0) {
      stats.penaltyAnalysis.avgPenaltiesPerRound = Math.round((totalPenalties / scoresWithHoles.length) * 100) / 100;
      stats.penaltyAnalysis.penaltyStrokesLost = totalPenalties;
      stats.penaltyAnalysis.holesWithPenalties = Object.entries(penaltyHoles)
        .map(([hole, data]) => ({ hole: parseInt(hole), ...data }))
        .sort((a, b) => b.totalPenalties - a.totalPenalties)
        .slice(0, 5);
    }

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
    console.log('Fetching course details for ID:', courseId);
    
    // Try the main course endpoint first
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
      console.log('Course details fetch failed:', response.status);
      return { success: false, error: 'Could not fetch course details' };
    }

    const data = await response.json();
    console.log('Course API response keys:', Object.keys(data));
    
    if (data.course) {
      console.log('Course name:', data.course.name);
      console.log('Tees available:', data.course.tees?.length || 0);
      
      // Log first tee to see structure
      if (data.course.tees?.[0]) {
        const firstTee = data.course.tees[0];
        console.log('First tee structure:', {
          name: firstTee.name,
          rating: firstTee.rating,
          slope: firstTee.slope,
          par: firstTee.par,
          yardage: firstTee.yardage,
          holesCount: firstTee.holes?.length || 0,
          sampleHole: firstTee.holes?.[0] || 'no holes array'
        });
        
        // If no holes data in tees, try to fetch tee-specific details
        if (!firstTee.holes || firstTee.holes.length === 0) {
          console.log('No holes in tees, trying tee-specific endpoint...');
          
          // Try fetching individual tee details which might have hole data
          for (const tee of data.course.tees.slice(0, 3)) {
            if (tee.id) {
              try {
                const teeResponse = await fetch(
                  `https://api2.ghin.com/api/v1/courses/${courseId}/tees/${tee.id}.json`,
                  {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                      'Authorization': `Bearer ${userToken}`
                    }
                  }
                );
                
                if (teeResponse.ok) {
                  const teeData = await teeResponse.json();
                  console.log(`Tee ${tee.name} details:`, Object.keys(teeData));
                  if (teeData.tee?.holes?.length > 0) {
                    tee.holes = teeData.tee.holes;
                    console.log(`Found ${tee.holes.length} holes for ${tee.name}`);
                  }
                }
              } catch (teeErr) {
                console.log(`Could not fetch tee ${tee.id} details`);
              }
            }
          }
        }
      }
      
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
    
    // Search for golfer by GHIN number using correct API
    const response = await fetch(
      `https://api.ghin.com/api/v1/golfers/search.json?per_page=1&page=1&golfer_id=${ghinNumber}&status=Active`,
      {
        method: 'GET',
        headers: {
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
          ghinNumber: golfer.ghin || golfer.ghin_number,
          firstName: golfer.first_name,
          lastName: golfer.last_name,
          fullName: golfer.player_name || `${golfer.first_name} ${golfer.last_name}`,
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

// Look up golfers by last name and state
export async function lookupByName(lastName, state) {
  try {
    const token = await authenticateAdmin();
    
    if (!token) {
      return { 
        success: false, 
        error: 'GHIN service unavailable.' 
      };
    }

    console.log('Looking up golfer by name:', lastName, 'State:', state);
    
    const response = await fetch(
      `https://api.ghin.com/api/v1/golfers/search.json?per_page=10&page=1&last_name=${encodeURIComponent(lastName)}&state=${encodeURIComponent(state)}&country=USA&status=Active`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('Name search response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GHIN name search failed:', response.status, errorText);
      return { 
        success: false, 
        error: 'Search failed. Please try again.' 
      };
    }

    const data = await response.json();
    const golfers = data.golfers || [];
    console.log('Golfers found:', golfers.length);
    
    if (golfers.length > 0) {
      return {
        success: true,
        results: golfers.slice(0, 10).map(g => ({
          ghinNumber: g.ghin || g.ghin_number,
          firstName: g.first_name,
          lastName: g.last_name,
          fullName: g.player_name || `${g.first_name} ${g.last_name}`,
          handicapIndex: g.handicap_index,
          lowHandicapIndex: g.low_hi,
          club: g.club_name,
          city: g.city,
          state: g.state
        }))
      };
    }

    return { 
      success: false, 
      error: 'No golfers found with that name in ' + state + '.' 
    };

  } catch (error) {
    console.error('GHIN name lookup error:', error);
    return { 
      success: false, 
      error: 'Search failed. Please try again.' 
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
