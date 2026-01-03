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
 * Generates a detailed practice plan PDF
 */
export function generatePracticePlanPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        gray: '#666666',
        lightGray: '#f5f5f5'
      };

      const pageWidth = doc.page.width - 80;

      // Header
      doc.rect(0, 0, doc.page.width, 80).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PRACTICE PLAN', 40, 25);
      
      doc.fontSize(12)
         .font('Helvetica')
         .text(`${userData.name} • Tailored for ${userData.missPattern || 'your'} miss pattern`, 40, 52);

      let yPos = 100;

      // Weekly Schedule
      if (analysis.practicePlan?.weeklySchedule?.length > 0) {
        analysis.practicePlan.weeklySchedule.forEach((session, sessionIndex) => {
          if (yPos > 650) {
            doc.addPage();
            yPos = 40;
          }

          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, 40, yPos);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(10)
             .font('Helvetica')
             .text(session.duration, 40 + doc.widthOfString(session.session) + 10, yPos + 2);
          
          yPos += 20;

          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(10)
               .font('Helvetica-Oblique')
               .text(session.focus, 40, yPos, { width: pageWidth });
            yPos += 18;
          }

          session.drills?.forEach((drill, drillIndex) => {
            if (yPos > 680) {
              doc.addPage();
              yPos = 40;
            }

            doc.rect(40, yPos, pageWidth, 70)
               .fill(colors.lightGray);
            
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name, 50, yPos + 10);
            
            doc.fillColor(colors.lightGreen)
               .fontSize(9)
               .text(drill.reps, pageWidth - 30, yPos + 10, { align: 'right' });
            
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(drill.description, 50, yPos + 28, { width: pageWidth - 30 });
            
            if (drill.why) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${drill.why}`, 50, yPos + 52, { width: pageWidth - 30 });
            }
            
            yPos += 80;
          });

          yPos += 20;
        });
      }

      // Pre-Round Routine
      if (analysis.practicePlan?.preRoundRoutine?.length > 0) {
        if (yPos > 550) {
          doc.addPage();
          yPos = 40;
        }

        doc.fillColor(colors.darkGreen)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('PRE-ROUND ROUTINE', 40, yPos);
        
        yPos += 25;

        analysis.practicePlan.preRoundRoutine.forEach((step, i) => {
          doc.circle(50, yPos + 5, 10)
             .fill(colors.lightGreen);
          
          doc.fillColor('white')
             .fontSize(10)
             .font('Helvetica-Bold')
             .text((i + 1).toString(), 47, yPos + 1);
          
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(step, 70, yPos, { width: pageWidth - 40 });
          
          yPos += 25;
        });
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}
