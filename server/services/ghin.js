// GHIN Handicap Lookup Service
// Fetches current handicap index from GHIN's public lookup

export async function lookupGHIN(ghinNumber) {
  try {
    // GHIN has a public API endpoint used by their lookup tool
    const response = await fetch(
      `https://api.ghin.com/api/v1/golfers/search.json?per_page=1&page=1&golfer_id=${ghinNumber}`,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error('GHIN lookup failed');
    }

    const data = await response.json();
    
    if (!data.golfers || data.golfers.length === 0) {
      return { success: false, error: 'GHIN number not found' };
    }

    const golfer = data.golfers[0];
    
    return {
      success: true,
      data: {
        ghinNumber: golfer.ghin,
        firstName: golfer.first_name,
        lastName: golfer.last_name,
        handicapIndex: golfer.handicap_index,
        lowHandicapIndex: golfer.low_hi,
        club: golfer.club_name,
        association: golfer.assoc_name,
        state: golfer.state,
        lastRevision: golfer.rev_date,
        trend: golfer.hi_trend // 'up', 'down', or 'stable'
      }
    };
  } catch (error) {
    console.error('GHIN lookup error:', error);
    
    // Fallback: try the alternative endpoint
    try {
      const altResponse = await fetch(
        `https://api.ghin.com/api/v1/golfer/${ghinNumber}/profile.json`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        return {
          success: true,
          data: {
            ghinNumber: altData.golfer?.ghin,
            firstName: altData.golfer?.first_name,
            lastName: altData.golfer?.last_name,
            handicapIndex: altData.golfer?.handicap_index,
            club: altData.golfer?.club_name,
          }
        };
      }
    } catch (altError) {
      console.error('GHIN alternate lookup error:', altError);
    }
    
    return { success: false, error: 'Unable to fetch GHIN data' };
  }
}

// Get recent score history (if available)
export async function getGHINScores(ghinNumber) {
  try {
    const response = await fetch(
      `https://api.ghin.com/api/v1/golfer/${ghinNumber}/scores.json?per_page=20`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Could not fetch scores' };
    }

    const data = await response.json();
    
    return {
      success: true,
      scores: data.scores?.map(score => ({
        date: score.played_at,
        course: score.course_name,
        score: score.adjusted_gross_score,
        rating: score.course_rating,
        slope: score.slope_rating,
        differential: score.score_differential,
        holes: score.number_of_holes
      })) || []
    };
  } catch (error) {
    console.error('GHIN scores error:', error);
    return { success: false, error: 'Unable to fetch scores' };
  }
}
