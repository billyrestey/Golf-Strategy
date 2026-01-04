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
  courseDetails 
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
    courseDetails
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
  courseDetails 
}) {
  
  const hasScoreData = extractedScores?.rounds?.length > 0;
  const hasCourseData = courseDetails?.tees?.length > 0;
  
  // Build course layout section if we have real data
  let courseLayoutSection = '';
  if (hasCourseData) {
    // Find the most common tee (usually men's middle tees)
    const tee = courseDetails.tees.find(t => 
      t.name?.toLowerCase().includes('white') || 
      t.name?.toLowerCase().includes('middle') ||
      t.name?.toLowerCase().includes('member')
    ) || courseDetails.tees[0];
    
    if (tee?.holes && tee.holes.length > 0) {
      courseLayoutSection = `
## ACTUAL COURSE LAYOUT (${courseDetails.name} - ${tee.name} tees)
Course Rating: ${tee.rating} / Slope: ${tee.slope} / Total Yards: ${tee.yardage}

HOLES:
${tee.holes.map((h, i) => `Hole ${i + 1}: Par ${h.par}, ${h.yardage} yards`).join('\n')}
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
${courseLayoutSection}
${hasScoreData ? `## SCORECARD DATA
${JSON.stringify(extractedScores, null, 2)}` : '## NO SCORECARD DATA PROVIDED'}

## YOUR TASK

Analyze this golfer's game and return a JSON object with the following structure. Be specific and actionable. Tailor everything to their miss pattern and strengths.
${hasCourseData ? '\nIMPORTANT: Use the ACTUAL course layout data provided above for holeByHoleStrategy. Do NOT invent or guess hole yardages/pars.' : '\nNOTE: No actual course hole data available. For holeByHoleStrategy, provide GENERAL advice by hole type (short par 4, long par 3, etc.) WITHOUT specific fake yardages. Use placeholder values like "TBD" for yards.'}

{
  "summary": {
    "currentHandicap": number,
    "targetHandicap": number (realistic 12-month goal),
    "potentialStrokeDrop": number,
    "keyInsight": "One sentence summary of biggest opportunity"
  },
  "troubleHoles": [
    {
      "type": "Category of hole (e.g., 'Long Par 4s over 400 yards')",
      "specificHoles": [list of hole numbers if scorecard data available, else null],
      "averageScore": number or null,
      "problem": "Why this hole type hurts them based on their miss pattern",
      "strategy": "Specific tactical advice",
      "acceptableScore": "Bogey" or "Par" etc,
      "clubRecommendation": "What to hit off the tee"
    }
  ],
  "strengthHoles": [
    {
      "type": "Category of hole",
      "specificHoles": [hole numbers or null],
      "opportunity": "Why they can score here",
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
      "light": "green" or "yellow" or "red",
      "strategy": "Brief strategy for this specific hole",
      "notes": "Any additional tips or warnings"
    }
  ],
  "practicePlan": {
    "weeklySchedule": [
      {
        "session": "Session name",
        "duration": "45 min",
        "focus": "What skill this addresses",
        "drills": [
          {
            "name": "Drill name",
            "description": "How to do it",
            "reps": "10 balls",
            "why": "Why this helps their specific issue"
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
    "puttsPerRound": "32"
  },
  "thirtyDayPlan": [
    {
      "week": 1,
      "focus": "Main focus area",
      "goals": ["Specific measurable goals"]
    }
  ]
}

Important guidelines:
1. Be specific to their miss pattern (${missPattern}). A slicer needs different advice than a hooker.
2. If scorecard data is available, include all 18 holes in holeByHoleStrategy with specific advice based on their patterns.
3. If NO scorecard data, still generate holeByHoleStrategy with general advice for typical hole types at a course of this caliber.
4. Practice drills should directly address their miss pattern.
5. Be encouraging but realistic about improvement timeline.
6. The strategy should feel personalized, not generic.
7. For holeByHoleStrategy, "light" should be: "red" for danger holes, "yellow" for conditional, "green" for birdie opportunities.
8. NOTE: Many golfers post 9-hole rounds to GHIN (which get combined into 18-hole equivalents). Do NOT make deductions about "inconsistent play" or "mental game issues" based on round data - 9-hole rounds are completely normal and common.

Return ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
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
