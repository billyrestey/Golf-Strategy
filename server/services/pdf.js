import PDFDocument from 'pdfkit';

/**
 * Generates a PDF strategy card from analysis data
 * @param {Object} analysis - The analysis object from Claude
 * @param {Object} userData - User info (name, handicap, course)
 * @returns {Promise<Buffer>} - PDF as buffer
 */
export function generateStrategyPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        mediumGreen: '#2d5a3d',
        red: '#c44536',
        yellow: '#d4a017',
        green: '#3d8b40',
        gray: '#555555',
        lightGray: '#f7f7f5',
        border: '#e0e0e0'
      };

      const pageWidth = doc.page.width - 100;
      const leftMargin = 50;

      // ========== PAGE 1 ==========

      // Elegant header
      doc.rect(0, 0, doc.page.width, 100).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text(userData.homeCourse?.toUpperCase() || 'COURSE STRATEGY', leftMargin, 30);
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.8)')
         .text(`${userData.name} • ${userData.handicap} Handicap • ${new Date().toLocaleDateString()}`, leftMargin, 65);

      let yPos = 130;

      // Key Insight - prominent box
      if (analysis.summary?.keyInsight) {
        doc.rect(leftMargin, yPos, pageWidth, 60)
           .fill(colors.lightGray);
        
        doc.fillColor(colors.darkGreen)
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('KEY INSIGHT', leftMargin + 15, yPos + 12);
        
        doc.fillColor(colors.gray)
           .fontSize(11)
           .font('Helvetica')
           .text(analysis.summary.keyInsight, leftMargin + 15, yPos + 28, { 
             width: pageWidth - 30,
             lineGap: 2
           });
        
        yPos += 80;
      }

      // Traffic Light System - horizontal layout
      doc.fillColor(colors.darkGreen)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('TEE SHOT STRATEGY', leftMargin, yPos);
      
      yPos += 25;

      // Helper to get holes from either format
      const getHoles = (lightData) => {
        if (!lightData) return null;
        if (lightData.holes) {
          return Array.isArray(lightData.holes) ? lightData.holes.join(', ') : lightData.holes;
        }
        return Array.isArray(lightData) ? lightData.join(', ') : lightData;
      };

      const getStrategy = (lightData) => {
        return lightData?.strategy || null;
      };

      const hasLightData = (lightData) => {
        if (!lightData) return false;
        if (lightData.holes) return lightData.holes.length > 0;
        return Array.isArray(lightData) ? lightData.length > 0 : !!lightData;
      };

      // Three column layout for traffic lights
      const colWidth = (pageWidth - 20) / 3;
      const lights = [
        { data: analysis.courseStrategy?.greenLightHoles, color: colors.green, label: 'GREEN LIGHT', subtitle: 'Attack' },
        { data: analysis.courseStrategy?.yellowLightHoles, color: colors.yellow, label: 'YELLOW LIGHT', subtitle: 'Conditional' },
        { data: analysis.courseStrategy?.redLightHoles, color: colors.red, label: 'RED LIGHT', subtitle: 'Play Safe' }
      ];

      lights.forEach((light, i) => {
        if (!hasLightData(light.data)) return;
        
        const x = leftMargin + (i * (colWidth + 10));
        
        // Card background
        doc.rect(x, yPos, colWidth, 100)
           .fill(colors.lightGray);
        
        // Color accent bar
        doc.rect(x, yPos, colWidth, 4).fill(light.color);
        
        // Label
        doc.fillColor(colors.darkGreen)
           .fontSize(8)
           .font('Helvetica-Bold')
           .text(light.label, x + 10, yPos + 14);
        
        doc.fillColor(colors.gray)
           .fontSize(7)
           .font('Helvetica')
           .text(light.subtitle, x + 10, yPos + 25);
        
        // Holes
        const holes = getHoles(light.data);
        if (holes) {
          doc.fillColor(colors.darkGreen)
             .fontSize(9)
             .font('Helvetica-Bold')
             .text(holes, x + 10, yPos + 42, { width: colWidth - 20 });
        }
        
        // Strategy (if exists)
        const strategy = getStrategy(light.data);
        if (strategy) {
          doc.fillColor(colors.gray)
             .fontSize(7)
             .font('Helvetica')
             .text(strategy, x + 10, yPos + 70, { width: colWidth - 20, lineGap: 1 });
        }
      });

      yPos += 120;

      // Trouble Holes - clean cards
      if (analysis.troubleHoles?.length > 0) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('TROUBLE HOLES', leftMargin, yPos);
        
        yPos += 25;

        analysis.troubleHoles.slice(0, 3).forEach((hole, i) => {
          // Card
          doc.rect(leftMargin, yPos, pageWidth, 75)
             .fill(colors.lightGray);
          
          // Red accent
          doc.rect(leftMargin, yPos, 4, 75).fill(colors.red);
          
          // Hole type
          doc.fillColor(colors.darkGreen)
             .fontSize(11)
             .font('Helvetica-Bold')
             .text(hole.type, leftMargin + 15, yPos + 12);
          
          // Target score badge
          if (hole.acceptableScore) {
            doc.fillColor(colors.lightGreen)
               .fontSize(8)
               .font('Helvetica-Bold')
               .text(`Target: ${hole.acceptableScore}`, pageWidth - 30, yPos + 12, { align: 'right' });
          }
          
          // Strategy
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(hole.strategy, leftMargin + 15, yPos + 32, { width: pageWidth - 40, lineGap: 2 });
          
          // Club recommendation
          if (hole.clubRecommendation) {
            doc.fillColor(colors.mediumGreen)
               .fontSize(8)
               .font('Helvetica-Bold')
               .text(`Club: ${hole.clubRecommendation}`, leftMargin + 15, yPos + 58);
          }
          
          yPos += 85;
        });
      }

      // ========== PAGE 2 ==========
      doc.addPage();
      yPos = 50;

      // Target Stats - large, clean boxes
      if (analysis.targetStats) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('YOUR TARGET STATS', leftMargin, yPos);
        
        yPos += 30;

        const stats = [
          { label: 'FAIRWAYS', value: analysis.targetStats.fairwaysHit },
          { label: 'PENALTIES', value: analysis.targetStats.penaltiesPerRound },
          { label: 'GIR', value: analysis.targetStats.gir },
          { label: 'UP & DOWN', value: analysis.targetStats.upAndDown }
        ].filter(s => s.value);

        const statWidth = (pageWidth - 30) / stats.length;
        stats.forEach((stat, i) => {
          const x = leftMargin + (i * (statWidth + 10));
          
          doc.rect(x, yPos, statWidth, 70)
             .fill(colors.lightGray);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(28)
             .font('Helvetica-Bold')
             .text(stat.value, x, yPos + 12, { width: statWidth, align: 'center' });
          
          doc.fillColor(colors.gray)
             .fontSize(8)
             .font('Helvetica')
             .text(stat.label, x, yPos + 50, { width: statWidth, align: 'center' });
        });

        yPos += 100;
      }

      // Mental Game Section
      if (analysis.mentalGame) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('MENTAL GAME', leftMargin, yPos);
        
        yPos += 30;

        // Pre-shot thought
        if (analysis.mentalGame.preShot) {
          doc.rect(leftMargin, yPos, pageWidth, 50)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 50).fill(colors.lightGreen);
          
          doc.fillColor(colors.mediumGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('PRE-SHOT THOUGHT', leftMargin + 15, yPos + 10);
          
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(analysis.mentalGame.preShot, leftMargin + 15, yPos + 28, { width: pageWidth - 40 });
          
          yPos += 65;
        }

        // Recovery thought
        if (analysis.mentalGame.recovery) {
          doc.rect(leftMargin, yPos, pageWidth, 50)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 50).fill(colors.yellow);
          
          doc.fillColor(colors.mediumGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('AFTER A BAD SHOT', leftMargin + 15, yPos + 10);
          
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(analysis.mentalGame.recovery, leftMargin + 15, yPos + 28, { width: pageWidth - 40 });
          
          yPos += 65;
        }

        // Mantras
        if (analysis.mentalGame.mantras?.length > 0) {
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('MANTRAS TO REMEMBER', leftMargin, yPos);
          
          yPos += 20;

          analysis.mentalGame.mantras.slice(0, 4).forEach((mantra, i) => {
            doc.circle(leftMargin + 8, yPos + 6, 4).fill(colors.lightGreen);
            
            doc.fillColor(colors.gray)
               .fontSize(10)
               .font('Helvetica-Oblique')
               .text(`"${mantra}"`, leftMargin + 25, yPos, { width: pageWidth - 40 });
            
            yPos += 28;
          });
        }
      }

      // Footer
      yPos = doc.page.height - 80;
      doc.rect(0, yPos, doc.page.width, 80).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text('ROUND FOCUS:', leftMargin, yPos + 20);
      
      const roundFocus = analysis.courseStrategy?.overallApproach || 
                         analysis.mentalGame?.preShot || 
                         'Play smart, trust your process, commit to every shot.';
      doc.font('Helvetica')
         .fontSize(10)
         .text(roundFocus, leftMargin, yPos + 35, { width: pageWidth });
      
      doc.fontSize(8)
         .fillColor('rgba(255,255,255,0.6)')
         .text('Generated by Golf Strategy • golfstrategy.app', leftMargin, yPos + 58);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a detailed practice plan PDF - Clean 2-page layout
 */
export function generatePracticePlanPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        mediumGreen: '#2d5a3d',
        gray: '#555555',
        lightGray: '#f7f7f5'
      };

      const pageWidth = doc.page.width - 100;
      const leftMargin = 50;

      // ========== PAGE 1 ==========
      
      // Header
      doc.rect(0, 0, doc.page.width, 100).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('PRACTICE PLAN', leftMargin, 30);
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.8)')
         .text(`${userData.name} • Tailored for ${userData.missPattern || 'your'} miss pattern`, leftMargin, 65);

      let yPos = 130;

      // Weekly Schedule - limit to first 2 sessions on page 1
      if (analysis.practicePlan?.weeklySchedule?.length > 0) {
        const sessions = analysis.practicePlan.weeklySchedule.slice(0, 2);
        
        sessions.forEach((session, sessionIndex) => {
          // Session header card
          doc.rect(leftMargin, yPos, pageWidth, 40)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 40).fill(colors.lightGreen);
          
          // Session name
          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, leftMargin + 15, yPos + 8);
          
          // Duration - positioned on the right
          doc.fillColor(colors.lightGreen)
             .fontSize(11)
             .font('Helvetica')
             .text(session.duration, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
          
          // Focus text
          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica-Oblique')
               .text(session.focus, leftMargin + 15, yPos + 26, { width: pageWidth - 100 });
          }
          
          yPos += 55;

          // Drills - limit to 2 per session
          const drills = session.drills?.slice(0, 2) || [];
          drills.forEach((drill, drillIndex) => {
            doc.rect(leftMargin, yPos, pageWidth, 65)
               .fill(colors.lightGray);
            
            // Drill name
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name, leftMargin + 15, yPos + 10, { width: pageWidth - 100 });
            
            // Reps badge
            if (drill.reps) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(9)
                 .font('Helvetica-Bold')
                 .text(drill.reps, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
            }
            
            // Description
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(drill.description, leftMargin + 15, yPos + 28, { width: pageWidth - 40 });
            
            // Why (if exists)
            if (drill.why) {
              doc.fillColor(colors.mediumGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${drill.why}`, leftMargin + 15, yPos + 48, { width: pageWidth - 40 });
            }
            
            yPos += 75;
          });

          yPos += 20;
        });
      }

      // ========== PAGE 2 ==========
      doc.addPage();
      yPos = 50;

      // Remaining sessions (if any)
      if (analysis.practicePlan?.weeklySchedule?.length > 2) {
        const remainingSessions = analysis.practicePlan.weeklySchedule.slice(2, 4);
        
        remainingSessions.forEach((session, sessionIndex) => {
          // Session header card
          doc.rect(leftMargin, yPos, pageWidth, 40)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 40).fill(colors.lightGreen);
          
          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, leftMargin + 15, yPos + 8);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(11)
             .font('Helvetica')
             .text(session.duration, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
          
          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica-Oblique')
               .text(session.focus, leftMargin + 15, yPos + 26, { width: pageWidth - 100 });
          }
          
          yPos += 55;

          const drills = session.drills?.slice(0, 2) || [];
          drills.forEach((drill) => {
            doc.rect(leftMargin, yPos, pageWidth, 65)
               .fill(colors.lightGray);
            
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name, leftMargin + 15, yPos + 10, { width: pageWidth - 100 });
            
            if (drill.reps) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(9)
                 .font('Helvetica-Bold')
                 .text(drill.reps, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
            }
            
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(drill.description, leftMargin + 15, yPos + 28, { width: pageWidth - 40 });
            
            if (drill.why) {
              doc.fillColor(colors.mediumGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${drill.why}`, leftMargin + 15, yPos + 48, { width: pageWidth - 40 });
            }
            
            yPos += 75;
          });

          yPos += 20;
        });
      }

      // Pre-Round Routine
      if (analysis.practicePlan?.preRoundRoutine?.length > 0) {
        yPos += 10;
        
        doc.fillColor(colors.darkGreen)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('PRE-ROUND ROUTINE', leftMargin, yPos);
        
        yPos += 30;

        analysis.practicePlan.preRoundRoutine.slice(0, 5).forEach((step, i) => {
          // Number circle
          doc.circle(leftMargin + 12, yPos + 8, 12)
             .fill(colors.lightGreen);
          
          doc.fillColor('white')
             .fontSize(11)
             .font('Helvetica-Bold')
             .text((i + 1).toString(), leftMargin + 8, yPos + 3);
          
          // Step text
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(step, leftMargin + 35, yPos + 2, { width: pageWidth - 50 });
          
          yPos += 35;
        });
      }

      // Footer
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(8)
         .font('Helvetica')
         .text('Generated by Golf Strategy • golfstrategy.app', leftMargin, footerY + 25);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}
