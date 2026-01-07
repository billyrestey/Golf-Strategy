import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyzes golf scorecards and player data to generate a personalized strategy
 */
export async function analyzeGolfGame({
  name,
  handicap,
  homeCourse,
  missPattern,
  missDescription,
  strengths,
  scorecardImages,
  ghinScores,
  courseDetails,
  aggregateStats
}) {
  
  // Step 1: Get score data from either GHIN or scorecard images
  let extractedScores = { rounds: [] };
  
  // Use GHIN scores if available (preferred - already structured)
  if (ghinScores && ghinScores.length > 0) {
    console.log(`Using ${ghinScores.length} GHIN scores for analysis`);
    extractedScores = {
      rounds: ghinScores.map(score => ({
        date: score.date,
        totalScore: score.totalScore,
        course: score.courseName,
        courseRating: score.courseRating,
        slopeRating: score.slopeRating,
        differential: score.differential,
        holes: score.holeScores?.map((s, i) => ({
          hole: i + 1,
          score: s.score || s,
          par: s.par,
          yards: s.yardage
        })) || null,
        stats: {
          fairwaysHit: score.fairwaysHit,
          gir: score.gir,
          putts: score.putts
        }
      })),
      source: 'ghin'
    };
  } else if (scorecardImages && scorecardImages.length > 0) {
    // Fall back to extracting from images
    extractedScores = await extractScoresFromImages(scorecardImages, homeCourse);
    extractedScores.source = 'images';
  }

  // Step 2: Generate comprehensive analysis
  const analysis = await generateStrategy({
    name,
    handicap,
    homeCourse,
    missPattern,
    missDescription,
    strengths,
    extractedScores,
    courseDetails,
    aggregateStats
  });

  return analysis;
}

/**
 * Uses Claude's vision to extract hole-by-hole scores from scorecard images
 */
async function extractScoresFromImages(images, courseName) {
  const content = [
    {
      type: 'text',
      text: `You are analyzing golf scorecard images for a course called "${courseName}".

Extract the hole-by-hole data from each scorecard image. For each round, provide:
- The date (if visible)
- Total score
- For each hole: hole number, par, yardage (if shown), and score

Return the data as JSON in this exact format:
{
  "rounds": [
    {
      "date": "MM/DD/YYYY or unknown",
      "totalScore": 85,
      "course": "Course Name",
      "holes": [
        {"hole": 1, "par": 4, "yards": 385, "score": 5},
        {"hole": 2, "par": 3, "yards": 165, "score": 3},
        ...
      ]
    }
  ]
}

If you cannot read certain values, use null. Extract as much as you can from each image.
Only return valid JSON, no other text.`
    },
    ...images
  ];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    });

    const responseText = response.content[0].text;
    
    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { rounds: [] };
  } catch (error) {
    console.error('Score extraction error:', error);
    return { rounds: [] };
  }
}

/**
 * Generates a comprehensive golf strategy based on all available data
 */
async function generateStrategy({
  name,
  handicap,
  homeCourse,
  missPattern,
  missDescription,
  strengths,
  extractedScores,
  courseDetails,
  aggregateStats
}) {
  
  const hasScoreData = extractedScores?.rounds?.length > 0;
  const hasAggregateStats = aggregateStats && Object.keys(aggregateStats).length > 0;

  // Check for course data - either from API or extracted from scores
  const hasCourseData = courseDetails?.tees?.[0]?.holes?.length > 0;
  
  // Build course layout section if we have real data
  let courseLayoutSection = '';
  if (hasCourseData) {
    // Find the best tee set to use
    const tee = courseDetails.tees.find(t => 
      t.name?.toLowerCase().includes('white') || 
      t.name?.toLowerCase().includes('middle') ||
      t.name?.toLowerCase().includes('member') ||
      t.name?.toLowerCase().includes('from scores')
    ) || courseDetails.tees[0];
    
    if (tee?.holes && tee.holes.length > 0) {
      const sourceNote = courseDetails.source === 'scores' 
        ? ' (extracted from your score history)' 
        : ` - ${tee.name} tees`;
      
      // Handle both formats - API returns par/yardage, scores returns holeNumber/par/yardage
      const holesFormatted = tee.holes.map((h, i) => {
        const holeNum = h.holeNumber || (i + 1);
        const par = h.par || '?';
        const yards = h.yardage ? `${h.yardage} yards` : 'yardage unknown';
        const avgScore = h.avgScore ? ` (your avg: ${h.avgScore})` : '';
        return `Hole ${holeNum}: Par ${par}, ${yards}${avgScore}`;
      }).join('\n');
      
      courseLayoutSection = `
## ACTUAL COURSE LAYOUT (${courseDetails.name}${sourceNote})
${tee.rating ? `Course Rating: ${tee.rating} / Slope: ${tee.slope} / ` : ''}Total Par: ${tee.par || 'N/A'}${tee.yardage ? ` / Total Yards: ${tee.yardage}` : ''}

HOLES:
${holesFormatted}
`;
    }
  }

  // Build aggregate stats section for comprehensive analysis
  let aggregateStatsSection = '';
  if (hasAggregateStats) {
    const parts = [];

    // Par-type performance
    const ptp = aggregateStats.parTypePerformance;
    if (ptp) {
      const par3Info = ptp.par3?.avgScore ? `Par 3s: avg ${ptp.par3.avgScore} (${ptp.par3.avgOverUnder > 0 ? '+' : ''}${ptp.par3.avgOverUnder} vs par) - ${ptp.par3.count} holes played` : null;
      const par4Info = ptp.par4?.avgScore ? `Par 4s: avg ${ptp.par4.avgScore} (${ptp.par4.avgOverUnder > 0 ? '+' : ''}${ptp.par4.avgOverUnder} vs par) - ${ptp.par4.count} holes played` : null;
      const par5Info = ptp.par5?.avgScore ? `Par 5s: avg ${ptp.par5.avgScore} (${ptp.par5.avgOverUnder > 0 ? '+' : ''}${ptp.par5.avgOverUnder} vs par) - ${ptp.par5.count} holes played` : null;

      if (par3Info || par4Info || par5Info) {
        parts.push(`### PAR-TYPE PERFORMANCE (Critical for strategy)
${par3Info || 'Par 3s: No data'}
${par4Info || 'Par 4s: No data'}
${par5Info || 'Par 5s: No data'}`);
      }

      // Scoring distribution by par type
      if (ptp.par3?.count > 0 || ptp.par4?.count > 0 || ptp.par5?.count > 0) {
        const distParts = [];
        if (ptp.par3?.count > 0) {
          distParts.push(`Par 3s: ${ptp.par3.birdies} birdies, ${ptp.par3.pars} pars, ${ptp.par3.bogeys} bogeys, ${ptp.par3.doubles} doubles+`);
        }
        if (ptp.par4?.count > 0) {
          distParts.push(`Par 4s: ${ptp.par4.birdies} birdies, ${ptp.par4.pars} pars, ${ptp.par4.bogeys} bogeys, ${ptp.par4.doubles} doubles+`);
        }
        if (ptp.par5?.count > 0) {
          distParts.push(`Par 5s: ${ptp.par5.birdies} birdies, ${ptp.par5.pars} pars, ${ptp.par5.bogeys} bogeys, ${ptp.par5.doubles} doubles+`);
        }
        if (distParts.length > 0) {
          parts.push(`### SCORING DISTRIBUTION BY PAR TYPE
${distParts.join('\n')}`);
        }
      }
    }

    // Overall scoring distribution
    const sd = aggregateStats.scoringDistribution;
    if (sd && (sd.birdies || sd.pars || sd.bogeys || sd.doubles)) {
      parts.push(`### OVERALL SCORING DISTRIBUTION
Eagles: ${sd.eagles || 0}, Birdies: ${sd.birdies || 0}, Pars: ${sd.pars || 0}, Bogeys: ${sd.bogeys || 0}, Doubles: ${sd.doubles || 0}, Triples+: ${(sd.triples || 0) + (sd.worse || 0)}`);
    }

    // Approach play analysis
    const aa = aggregateStats.approachAnalysis;
    if (aa) {
      const approachParts = [];
      if (aa.girPercentage != null) approachParts.push(`Overall GIR: ${aa.girPercentage}%`);
      if (aa.girOnPar3 != null) approachParts.push(`GIR on Par 3s: ${aa.girOnPar3}%`);
      if (aa.girOnPar4 != null) approachParts.push(`GIR on Par 4s: ${aa.girOnPar4}%`);
      if (aa.girOnPar5 != null) approachParts.push(`GIR on Par 5s: ${aa.girOnPar5}%`);

      if (aa.greenMissPatterns?.total > 0) {
        const gmp = aa.greenMissPatterns;
        const total = gmp.total;
        approachParts.push(`Green miss patterns: Short ${Math.round(gmp.short/total*100)}%, Long ${Math.round(gmp.long/total*100)}%, Left ${Math.round(gmp.left/total*100)}%, Right ${Math.round(gmp.right/total*100)}%`);
      }

      if (approachParts.length > 0) {
        parts.push(`### APPROACH PLAY ANALYSIS
${approachParts.join('\n')}`);
      }
    }

    // Short game analysis
    const sga = aggregateStats.shortGameAnalysis;
    if (sga) {
      const sgParts = [];
      if (sga.avgPuttsPerGIR != null) sgParts.push(`Avg putts when hitting green: ${sga.avgPuttsPerGIR}`);
      if (sga.avgPuttsPerMissedGIR != null) sgParts.push(`Avg putts when missing green: ${sga.avgPuttsPerMissedGIR}`);
      if (sga.upAndDownRate != null) sgParts.push(`Up-and-down rate: ${sga.upAndDownRate}%`);
      if (sga.sandSaveRate != null) sgParts.push(`Sand save rate: ${sga.sandSaveRate}%`);

      if (sgParts.length > 0) {
        parts.push(`### SHORT GAME & PUTTING ANALYSIS
${sgParts.join('\n')}`);
      }
    }

    // Penalty analysis
    const pa = aggregateStats.penaltyAnalysis;
    if (pa && pa.avgPenaltiesPerRound != null) {
      let penaltyText = `Avg penalties per round: ${pa.avgPenaltiesPerRound}`;
      if (pa.holesWithPenalties?.length > 0) {
        penaltyText += `\nWorst penalty holes: ${pa.holesWithPenalties.map(h => `#${h.hole} (${h.totalPenalties} total)`).join(', ')}`;
      }
      parts.push(`### PENALTY ANALYSIS
${penaltyText}`);
    }

    // Trouble holes and birdie holes from aggregate analysis
    if (aggregateStats.troubleHoles?.length > 0) {
      parts.push(`### IDENTIFIED TROUBLE HOLES (data-driven)
${aggregateStats.troubleHoles.slice(0, 5).map(h => `Hole ${h.hole} (par ${h.par}): avg +${h.avgOver.toFixed(1)} over par`).join('\n')}`);
    }

    if (aggregateStats.birdieHoles?.length > 0) {
      parts.push(`### IDENTIFIED BIRDIE OPPORTUNITIES (data-driven)
${aggregateStats.birdieHoles.slice(0, 5).map(h => `Hole ${h.hole} (par ${h.par}): avg ${h.avgOver > 0 ? '+' : ''}${h.avgOver.toFixed(1)} vs par`).join('\n')}`);
    }

    // Fairway miss patterns
    if (aggregateStats.fairwayMissLeft > 0 || aggregateStats.fairwayMissRight > 0) {
      parts.push(`### FAIRWAY MISS PATTERNS (from actual data)
Miss left: ${aggregateStats.fairwayMissLeft}% of misses
Miss right: ${aggregateStats.fairwayMissRight}% of misses`);
    }

    if (parts.length > 0) {
      aggregateStatsSection = `
## PERFORMANCE ANALYTICS (Use this data heavily in your analysis)
${parts.join('\n\n')}
`;
    }
  }

  const prompt = `You are an expert golf coach and course strategist. Analyze this golfer's game and create a comprehensive improvement strategy.

## GOLFER PROFILE
- Name: ${name}
- Current Handicap: ${handicap}
- Home Course: ${homeCourse}
- Primary Miss Pattern: ${getMissDescription(missPattern)}
${missDescription ? `- Additional Context: ${missDescription}` : ''}
- Self-Reported Strengths: ${strengths.length > 0 ? strengths.join(', ') : 'None specified'}
${courseLayoutSection}${aggregateStatsSection}
${hasScoreData ? `## SCORECARD DATA
${JSON.stringify(extractedScores, null, 2)}` : '## NO SCORECARD DATA PROVIDED'}

## YOUR TASK

Analyze this golfer's game and return a JSON object with the following structure. Be specific and actionable. ${hasAggregateStats ? 'PRIORITIZE the PERFORMANCE ANALYTICS data - this is actual measured data and should drive your recommendations more than self-reported miss patterns.' : 'Tailor everything to their miss pattern and strengths.'}
${hasCourseData ? '\nIMPORTANT: Use the ACTUAL course layout data provided above for holeByHoleStrategy. Do NOT invent or guess hole yardages/pars.' : '\nIMPORTANT: No actual course hole data is available. Set holeByHoleStrategy to an EMPTY ARRAY []. Do not generate fake hole data.'}

{
  "summary": {
    "currentHandicap": number,
    "targetHandicap": number (realistic 12-month goal),
    "potentialStrokeDrop": number,
    "keyInsight": "One sentence summary of biggest opportunity - should reference actual data patterns if available",
    "biggestStrokeSaver": "The single area where they can save the most strokes (based on data analysis)"
  },
  "parTypeStrategies": {
    "par3": {
      "currentPerformance": "Summary of how they play par 3s based on data",
      "mainIssue": "What's costing them strokes on par 3s (club selection, green miss pattern, etc.)",
      "strategy": "Specific tactical approach for par 3s",
      "targetScore": "Average score goal",
      "keyTip": "One actionable tip for par 3s"
    },
    "par4": {
      "currentPerformance": "Summary of how they play par 4s based on data",
      "mainIssue": "What's costing them strokes on par 4s",
      "strategy": "Specific tactical approach for par 4s",
      "targetScore": "Average score goal",
      "keyTip": "One actionable tip for par 4s"
    },
    "par5": {
      "currentPerformance": "Summary of how they play par 5s based on data",
      "mainIssue": "What's costing them strokes on par 5s",
      "strategy": "Specific tactical approach - layup vs go decisions",
      "targetScore": "Average score goal",
      "keyTip": "One actionable tip for par 5s"
    }
  },
  "scoringAreaAnalysis": {
    "teeToGreen": {
      "assessment": "How well are they getting to the green?",
      "strokesLost": "Estimated strokes lost here per round",
      "improvement": "Specific advice to improve"
    },
    "approachPlay": {
      "assessment": "GIR analysis and green miss patterns",
      "strokesLost": "Estimated strokes lost here per round",
      "improvement": "Club selection tips, miss pattern advice, distance control tips"
    },
    "shortGame": {
      "assessment": "Up and down rate, typical miss around greens",
      "strokesLost": "Estimated strokes lost here per round",
      "improvement": "Chipping and pitching advice based on their miss patterns"
    },
    "putting": {
      "assessment": "Putting analysis - 3-putts, make percentage",
      "strokesLost": "Estimated strokes lost here per round",
      "improvement": "Speed control, read, routine advice"
    },
    "penalties": {
      "assessment": "How many penalty strokes per round and where",
      "strokesLost": "Strokes lost to penalties per round",
      "improvement": "Course management to avoid penalty situations"
    }
  },
  "troubleHoles": [
    {
      "type": "Category of hole (e.g., 'Long Par 4s over 400 yards')",
      "specificHoles": [list of hole numbers if scorecard data available, else null],
      "averageScore": number or null,
      "problem": "Why this hole type hurts them - reference DATA if available",
      "strategy": "Specific tactical advice covering tee shot, approach, AND short game",
      "acceptableScore": "Bogey" or "Par" etc,
      "fullPlan": "Complete hole strategy from tee to green"
    }
  ],
  "strengthHoles": [
    {
      "type": "Category of hole",
      "specificHoles": [hole numbers or null],
      "opportunity": "Why they can score here - reference DATA if available",
      "strategy": "How to attack",
      "targetScore": "Par" or "Birdie"
    }
  ],
  "courseStrategy": {
    "redLightHoles": {
      "holes": [hole numbers or "Long par 4s over 400 yards"],
      "strategy": "Specific advice on how to play these holes safely"
    },
    "yellowLightHoles": {
      "holes": [hole numbers or "Reachable par 5s, medium par 4s"],
      "strategy": "When to attack (conditions: wind, lie, score) vs when to lay up"
    },
    "greenLightHoles": {
      "holes": [hole numbers or "Short par 4s, par 5s"],
      "strategy": "How to maximize scoring opportunities on these holes"
    },
    "overallApproach": "2-3 sentence philosophy for the round"
  },
  "holeByHoleStrategy": [
    {
      "hole": 1,
      "par": 4,
      "yards": 385,
      "teeShot": "Driver OK" or "3-Wood" or "Hybrid",
      "approachStrategy": "How to play the approach shot - club selection, target, miss side",
      "missSide": "If you miss the green, miss here (short/long/left/right)",
      "light": "green" or "yellow" or "red",
      "strategy": "Brief overall strategy for this specific hole",
      "notes": "Any additional tips based on their historical performance on this hole"
    }
  ],
  "practicePlan": {
    "priorityAreas": [
      {
        "area": "Name of area (based on data - e.g., 'Par 3 tee shots', 'Approach play', 'Putting')",
        "reason": "Why this is priority #1 based on data analysis",
        "expectedImprovement": "Strokes per round you could save"
      }
    ],
    "weeklySchedule": [
      {
        "session": "Session name",
        "duration": "45 min",
        "focus": "What skill this addresses - tied to data analysis",
        "drills": [
          {
            "name": "Drill name",
            "description": "How to do it",
            "reps": "10 balls",
            "why": "Why this helps based on their actual data patterns"
          }
        ]
      }
    ],
    "preRoundRoutine": [
      "Step 1...",
      "Step 2..."
    ],
    "practiceRoundFocus": [
      "Thing to track/work on during practice rounds"
    ]
  },
  "mentalGame": {
    "preShot": "Key thought before trouble shots",
    "recovery": "What to think after a bad shot",
    "mantras": ["List of 3-4 personalized mantras"]
  },
  "targetStats": {
    "fairwaysHit": "40%",
    "penaltiesPerRound": "< 2",
    "gir": "25%",
    "upAndDown": "35%",
    "puttsPerRound": "32",
    "par3Average": "Target average score on par 3s",
    "par4Average": "Target average score on par 4s",
    "par5Average": "Target average score on par 5s"
  },
  "handicapPath": {
    "currentLevel": {
      "handicap": number,
      "playerProfile": "Description of typical player at this level (e.g., 'A 15-handicap typically shoots 87-90, hits 3-4 GIR per round...')",
      "strengths": ["What this player does relatively well based on data"],
      "weaknesses": ["Key areas holding them back based on data"]
    },
    "targetLevel": {
      "handicap": number,
      "playerProfile": "Description of what a player at target level looks like",
      "requiredStats": {
        "fairwaysHit": "% needed at target level",
        "gir": "% needed at target level",
        "puttsPerRound": "putts needed at target level",
        "upAndDown": "% needed at target level",
        "penaltiesPerRound": "max penalties at target level"
      },
      "keyDifferences": "What separates current level from target level"
    },
    "gapAnalysis": [
      {
        "area": "Skill area (e.g., 'Greens in Regulation')",
        "current": "Current stat/performance",
        "required": "What's needed at target handicap",
        "gap": "The difference to close",
        "difficulty": "Easy/Medium/Hard to improve",
        "strokesToGain": "Estimated strokes per round this would save"
      }
    ],
    "improvementPriorities": [
      {
        "rank": 1,
        "skill": "Skill to focus on",
        "why": "Why this is the #1 priority based on their data",
        "currentLevel": "Where they are now",
        "targetLevel": "Where they need to be",
        "howToImprove": "Specific actionable advice",
        "expectedTimeframe": "How long to see improvement"
      }
    ],
    "milestones": [
      {
        "handicap": "Intermediate handicap goal (e.g., if going from 15 to 10, first milestone might be 13)",
        "statsToReach": "Key stats to hit at this milestone",
        "focusAreas": ["What to work on to reach this milestone"],
        "estimatedTimeframe": "Realistic time to reach this milestone"
      }
    ],
    "quickWins": [
      {
        "tip": "Something they can implement immediately",
        "impact": "Expected stroke savings",
        "effort": "Low/Medium effort required"
      }
    ]
  },
  "thirtyDayPlan": [
    {
      "week": 1,
      "focus": "Main focus area - based on data analysis",
      "goals": ["Specific measurable goals"]
    }
  ]
}

Important guidelines:
1. ${hasAggregateStats ? 'PRIORITIZE DATA over self-reported miss patterns. If the data shows they miss greens short 60% of the time, address that. If they struggle on par 5s, focus there.' : 'Be specific to their miss pattern.'} A slicer needs different advice than a hooker, but DATA trumps self-reports.
2. If performance analytics show par-type weaknesses, make those central to your recommendations.
3. Address ALL scoring areas - not just tee shots. Approach play, short game, and putting improvements often yield faster results.
4. If scorecard data is available, include all 18 holes in holeByHoleStrategy with approach strategy and miss side for EACH hole.
5. Practice plan priority areas should be ranked by strokes-saved potential based on actual data.
6. Be encouraging but realistic about improvement timeline.
7. The strategy should feel personalized and data-driven, not generic.
8. For holeByHoleStrategy, "light" should be: "red" for danger holes, "yellow" for conditional, "green" for birdie opportunities.
9. NOTE: Many golfers post 9-hole rounds to GHIN. Do NOT make deductions about "inconsistent play" based on round data.
10. If green miss pattern data is available, use it to recommend approach targets and miss sides.
11. Consider penalty analysis - if they're losing strokes to penalties on specific holes, address course management.
12. HANDICAP PATH: Use these benchmark stats for different handicap levels:
    - Scratch (0): 65% fairways, 67% GIR, 29 putts, 60% up-and-down, <0.5 penalties
    - 5 handicap: 55% fairways, 50% GIR, 31 putts, 50% up-and-down, <1 penalty
    - 10 handicap: 45% fairways, 35% GIR, 33 putts, 40% up-and-down, <1.5 penalties
    - 15 handicap: 35% fairways, 22% GIR, 35 putts, 30% up-and-down, <2 penalties
    - 20 handicap: 30% fairways, 12% GIR, 37 putts, 20% up-and-down, <3 penalties
    - 25+ handicap: 25% fairways, 5% GIR, 38+ putts, 15% up-and-down, 3+ penalties
    Use these to create realistic gap analysis and milestones. If they're a 15 going to 10, show what stats need to improve.
13. For improvementPriorities, rank by IMPACT - which skill improvement will drop the most strokes? Usually: reducing penalties > improving GIR > improving up-and-down > reducing 3-putts.
14. Include 2-3 milestones for handicap drops of 5+ strokes (e.g., 18→10 should have milestones at 15 and 12).

Return ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = response.content[0].text;
    
    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Add the extracted scores to the response
      analysis.extractedScores = extractedScores;
      
      return analysis;
    }
    
    throw new Error('Failed to parse analysis response');
  } catch (error) {
    console.error('Strategy generation error:', error);
    throw error;
  }
}

/**
 * Convert miss pattern code to human-readable description
 */
function getMissDescription(pattern) {
  const patterns = {
    'slice': 'Slice / fade that runs away to the right',
    'hook': 'Hook / draw that turns over to the left',
    'both': 'Two-way miss - can go either direction',
    'straight_short': 'Straight but short - contact/distance issues'
  };
  return patterns[pattern] || pattern;
}
