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
  scorecardImages 
}) {
  
  // Step 1: Extract scores from scorecards (if provided)
  let extractedScores = [];
  
  if (scorecardImages.length > 0) {
    extractedScores = await extractScoresFromImages(scorecardImages, homeCourse);
  }

  // Step 2: Generate comprehensive analysis
  const analysis = await generateStrategy({
    name,
    handicap,
    homeCourse,
    missPattern,
    missDescription,
    strengths,
    extractedScores
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
  extractedScores 
}) {
  
  const hasScoreData = extractedScores?.rounds?.length > 0;
  
  const prompt = `You are an expert golf coach and course strategist. Analyze this golfer's game and create a comprehensive improvement strategy.

## GOLFER PROFILE
- Name: ${name}
- Current Handicap: ${handicap}
- Home Course: ${homeCourse}
- Primary Miss Pattern: ${getMissDescription(missPattern)}
${missDescription ? `- Additional Context: ${missDescription}` : ''}
- Self-Reported Strengths: ${strengths.length > 0 ? strengths.join(', ') : 'None specified'}

${hasScoreData ? `## SCORECARD DATA
${JSON.stringify(extractedScores, null, 2)}` : '## NO SCORECARD DATA PROVIDED'}

## YOUR TASK

Analyze this golfer's game and return a JSON object with the following structure. Be specific and actionable. Tailor everything to their miss pattern and strengths.

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
    "redLightHoles": [hole numbers or general advice],
    "yellowLightHoles": [hole numbers or general advice],
    "greenLightHoles": [hole numbers or general advice],
    "overallApproach": "2-3 sentence philosophy for the round"
  },
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
2. If scorecard data is available, reference specific holes by number.
3. Practice drills should directly address their miss pattern.
4. Be encouraging but realistic about improvement timeline.
5. The strategy should feel personalized, not generic.

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
