"""Build the illustrated user guide from actual local demo screenshots."""
from pathlib import Path
import shutil
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/guides/neko-pulse-user-guide.pdf'
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='NTitle', fontName='Helvetica-Bold', fontSize=25, leading=29, textColor=colors.HexColor('#123229'), spaceAfter=14))
styles.add(ParagraphStyle(name='NSub', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=colors.HexColor('#0b6b4d'), spaceBefore=11, spaceAfter=6))
styles.add(ParagraphStyle(name='NBody', fontName='Helvetica', fontSize=10, leading=14, textColor=colors.HexColor('#334155'), spaceAfter=7))
styles.add(ParagraphStyle(name='NCaption', fontName='Helvetica', fontSize=8, leading=11, textColor=colors.HexColor('#64748b'), spaceAfter=10))
styles.add(ParagraphStyle(name='NNote', parent=styles['NBody'], backColor=colors.HexColor('#edf5ef'), borderPadding=9, spaceBefore=9, spaceAfter=12))
story=[]
def p(text, style='NBody'):
    story.append(Paragraph(escape(text),styles[style]))
def shot(name, caption):
    filename=ROOT/f'docs/guide/screens/{name}.jpg'
    w,h=ImageReader(str(filename)).getSize()
    scale=min(475/w,260/h)
    story.append(Image(str(filename),width=w*scale,height=h*scale))
    p(caption+' Actual Neko Pulse screen; fictional demo data. Zoom for detail.','NCaption')
def chapter(number,title,audience,intro,steps,notes,image=None):
    story.append(PageBreak())
    p(f'{number:02d} / {audience.upper()}','NCaption')
    p(title,'NTitle'); p(intro)
    if image: shot(*image)
    p('How to use it','NSub')
    for i,step in enumerate(steps,1): p(f'{i}. {step}')
    p('Check before moving on','NSub')
    for note in notes: p(note,'NNote')

p('NEKO PULSE','NSub'); story.append(Spacer(1,30))
p('Your restaurant.\nYour team.\nOne clear way to work.','NTitle')
p('Illustrated user guide','NSub')
p('For owners, outlet managers and crew. A practical reference for setting up your workspace, running a shift and building team capability.')
shot('hub','The owner hub: choose the module for the work you need to do.')
p('Edition 1.0 | 5 October 2026','NCaption')
p('Screenshots were captured from the actual local application with fictional, read-only demo records. No real employee, customer or restaurant records are included. Empty demo charts are examples, not a statement about your business.','NNote')
p('Your available modules depend on your role, outlet assignment and owner permissions. Buttons and menus may change with future releases. This guide is not proof that a feature is enabled for your account.','NBody')

chapters=[
('Start your trial and sign in','New owners','The public website explains the product. The app is where your workspace and daily records live.',[
'Choose Start my free month on the website. Enter your business name, tenant identifier, owner name, work email, password and outlets.',
'Open the verification email and verify the address. Check spam if needed. Return to the signup page and choose I verified my email, or Already registered? Activate your verified account.',
'Enter the same email and password to activate. The 30-day period starts at activation, not merely when you fill out the form.',
'On the confirmation screen, check the trial end date. Choose Open Neko Pulse or View user guide (PDF). Bookmark the app login link.',
'If the app asks you to sign in, choose Manager sign in. Owners and managers use their email/password; crew use their assigned Crew Code.',
'If email delivery fails but activation succeeds, use the displayed app link. Do not create another account just to get another email.'
],['A welcome email may depend on your platform operator configuring a sending service. A provider accepting an email is not the same as confirmed inbox delivery. Passwords are never sent in the welcome email.','The trial does not charge automatically. Subscription/payment availability is separate from login and must be confirmed with the platform operator.'],None),
('Install the phone home-screen app','Everyone','Neko Pulse can open like an app from an icon on your phone. Install the operational app page, not the marketing website.',[
'iPhone/iPad: open the app login page in Safari. Tap Share (or More, then Share).',
'Choose Add to Home Screen. If offered, keep Open as Web App enabled, then tap Add.',
'Android: open the app in Chrome. Use the three-dot menu and choose Add to home screen or Install app. Confirm the prompt.',
'Tap the new Neko Pulse icon. Sign in with your own credentials. A separate sign-in may be needed in the installed app.',
'If the installation option is missing, open the link directly in Safari or Chrome rather than inside WhatsApp or another in-app browser.',
'When an update notice appears, save unfinished work before updating. Keep an internet connection for attendance, tasks and other live operations.'
],['Adding an icon does not give extra permissions, make attendance valid away from the store, or guarantee a permanent login. Do not save an owner session on a shared crew device.','Official instructions: support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios and support.google.com/chrome/answer/9658361. Browser wording varies.'],None),
('Know who does what','Owners and managers','Access has two parts: which modules a person may use and which outlets they may manage.',[
'Owner: configure the restaurant, manage employees and permissions, review reports and approve sensitive changes.',
'Outlet manager: run the authorised outlet or outlets, plan shifts, assign work, manage training and follow up on problems.',
'Crew: use their personal app for assigned work, shifts and learning. An authorised counter role may have additional operational tools.',
'Trainer/assessor: use only the practical-training actions their account is authorised to perform.',
'Platform administrator: manage the software platform and tenants. This is not automatically the same as a restaurant owner.',
'Open a module from the hub. Use the back arrow to return; use Logout on shared devices.'
],['Do not share one owner login among staff. Never grant the Owner role simply to make a missing button appear. Ask the owner to review the proper module and outlet permissions.'],('hub','Find the module cards on the owner hub.')),
('Set up stores and time settings','Owner / authorised administrator','Stores provide the stable outlet identifiers used by employees, shifts, tasks and training.',[
'Open Stores. Review Global App Configuration and set the business timezone, then save.',
'In Add New Outlet, enter Store Name, a unique stable Outlet ID and the address.',
'Keep Store is active selected for an operating outlet. Add regulatory details and certificates where appropriate.',
'Choose Save Store. Confirm the new outlet is listed and active.',
'To change an existing outlet, use its edit action and review the saved result.',
'To close an outlet, use its close action only after planning what should happen to staff and future work.'
],['Closed outlets are excluded from new operational work. Do not rename or reuse stable outlet identifiers casually. An outlet is part of your tenant, not a new tenant.'],('stores','Timezone configuration, outlet fields and active status.')),
('Create staff and managers','Owner / authorised employee manager','Create a separate profile for each person. Select Staff Directory or Managers according to the type of account.',[
'Open Employees and choose the relevant directory. Choose Add New.',
'Enter the person’s name and relevant details. Add a photo only with the appropriate consent.',
'For staff, select the role, store and Crew Code/PIN. Keep the code private and unique.',
'For managers, use the manager account fields for email/login. Review the primary outlet and any additional managed-outlet or all-outlet controls shown.',
'Save the profile, then confirm it appears in the correct directory. Share login instructions privately, not in public screenshots.',
'Use edit for corrections. When someone leaves, review active status and access rather than deleting audit history casually.'
],['A person assigned to several managed outlets should only receive the outlets they need. Personal information, leave balances and employment dates should be checked before saving.'],('employees','Employee directory and Add Profile fields.')),
('Give the right access','Owner / security administrator','The Access Control Matrix controls module and crew-feature availability by role. Outlet membership remains a separate boundary.',[
'Open Access. Find the role column and the module or feature row.',
'For a manager role, select the admin modules needed for their work.',
'For crew, select relevant Crew App Features, such as tasks, shifts, training or development.',
'Review the separate Crew App Admin Tools section carefully: it exposes management pages inside the staff app.',
'Choose Save Changes. Test using the intended role, not the owner account.',
'If a manager needs multiple stores, review their employee/manager outlet assignment as well as the matrix.'
],['Use least privilege. A checked module does not authorise another tenant’s data. Some protected functions remain reserved for security administrators.'],('access','Rows represent features; columns represent roles.')),
('Create and assign daily tasks','Manager / authorised task administrator','Task definitions describe recurring work; completion logs show what happened on a particular day.',[
'Open Task Manager and select Tasks. Use store, frequency and search filters to find existing work first.',
'Choose + New Task. Complete the title, instructions and outlet fields provided by the editor.',
'Choose the appropriate schedule/frequency and assignment controls. Select eligible people or roles as offered.',
'Set any required completion proof. Make instructions specific: what good looks like, when it is due, and who should act.',
'Save, then confirm the task appears in the list. Check the Monitor tab for today’s expected instances.',
'Use Templates for repeatable definitions and Alerts for the available reminder settings. Avoid making duplicate tasks for the same job.'
],['Example: “Clean the bar before opening; follow the hygiene standard and attach the required photo.” Training teaches competence; a task records today’s execution.'],('tasks','Tasks tab, filters and + New Task.')),
('Follow up on tasks','Manager and crew','Use the monitor to distinguish completed, overdue and scheduled work instead of assuming a task was done.',[
'Manager: open Monitor, choose TODAY, YESTERDAY, WEEK, MONTH or QUARTER, then filter by store.',
'Review completion counts and compliance. Use All Tasks, Completed, Overdue or Scheduled in Detailed Logs.',
'Crew: sign in with your own Crew Code and open Tasks. Check the assigned task instructions and due time.',
'Complete the actual work, then supply the required proof and submit the completion using the action shown.',
'If something cannot be completed safely, tell the manager. Do not mark it complete merely to clear the list.',
'If assigned tasks are missing, check the employee’s active status, role, outlet, task schedule and crew-task access.'
],['A low completion rate is a prompt to investigate workload, assignment and evidence. It is not a standalone judgment of employee performance.'],None),
('Build the weekly shift roster','Manager / authorised scheduler','Define shifts first, then assign them to employees at the selected outlet.',[
'Open Shift Management. Choose the outlet in SELECT OUTLET.',
'Open Templates and create the required shift definitions with names, start times and end times.',
'Return to Roster and choose the week. Find the employee row and the correct day.',
'Use the roster cell’s assignment controls to allocate a defined shift. Use Mark Day Off where appropriate.',
'Review coverage, hours and outlet selection. Duplicate this week’s schedule only after checking it is the correct source week.',
'Use Share Roster to review the message and period before sharing. Staff can check their personal shifts in the crew app.'
],['“No shifts defined” means you need shift templates for that outlet. Punctuality reports require roster assignments with meaningful start times; an attendance scan alone is insufficient.'],('shifts','Outlet selector, week controls and per-person roster.')),
('Run attendance and the store kiosk','Manager and crew','Attendance records clock-in/out; the roster records the expected shift. The store kiosk must be configured for the right business and outlet.',[
'Manager: open Attendance > Dashboard and review Today’s Logs and pending leave requests.',
'Use Launch Kiosk only on the authorised store device. Confirm its business and outlet setup; do not use a generic kiosk link as a substitute.',
'Crew: use the store’s authorised attendance process to scan/check in. Confirm the success message before starting work.',
'At the end of the shift, check out and confirm success. A page loading or a scan opening is not proof of a saved attendance event.',
'If a kiosk says it needs a business link, ask the manager to relaunch/configure it from Attendance at the outlet.',
'Use Report for history, Leave balance for balances, and Settings for authorised attendance configuration. Use Log Leave on Behalf only for a checked, legitimate request.'
],['Do not clear browser storage or reset a working store device without a plan to reconfigure it. If check-out fails, note the time and tell the manager; do not invent a replacement attendance record.'],('attendance','Dashboard, attendance reports, settings and authorised kiosk launch.')),
('Create and publish training','Training-authorised manager / owner','Choose Theory for self-completed reading/video learning, or Practical for manager-led competence checks.',[
'Open Training > Modules > New module. Enter the title, track and Training type.',
'Write clear instructions with expected standards and escalation points. Select applicable outlets and roles.',
'For Theory, add the video/content controls shown. Preview playback on both desktop and the crew phone before assignment.',
'For Practical, review supervised attempts, minimum passing score, validity period and safety warnings.',
'Keep Module status as Draft while preparing it. Check all settings before selecting Published and Save version.',
'When editing published content, include a change summary and review the version. Archive retired modules; do not erase historical results.'
],['A video file extension alone does not guarantee playback compatibility. Where the app reports encoding problems, use a compatible MP4/H.264/AAC source and test the assigned crew view. Draft and archived modules cannot receive new assignments.'],('training','Actual training editor: title, track, type, requirements and status.')),
('Assign, complete and certify training','Managers, trainers and crew','Employees receive individual assignment records, even when you select a role or group.',[
'Manager: open Assignments, select a published module and use the employee/role/outlet/all-eligible selection controls.',
'Review recipients, mandatory status, due date and reason before assigning. Outlet and role applicability must be correct.',
'Theory crew: open assigned training, read the instructions or watch the video, then use Complete when finished.',
'Practical crew: read the current status and manager feedback. The manager records practical progress; crew do not certify themselves.',
'Manager: use Dashboard/Progress to inspect each assignment. Demonstrate means you show the method; Practice records an observed attempt; Pass Practical records the assessment outcome.',
'Use Retraining when the standard is not met. Certify only after the required checks pass. Check expiry, notes and employee identity before confirming.'
],['Theory completion is not a practical qualification. Practical certification must be recorded by an authorised assessor; managers must not certify themselves. A critical failure requires retraining, regardless of a numerical score.'],None),
('Use Employee Development','Managers; crew see their own growth','Combine operational evidence with coaching. Missing data should be read as unavailable, not automatically as poor performance.',[
'Open Employee Development > Overview. Filter outlet, department, role, employee and the data period.',
'Review attendance reliability, training completion, certification coverage and operational risks.',
'Use Skills Library to define relevant skills and link certification modules where appropriate.',
'Open Skills Matrix or Employees to inspect an employee profile and evidence.',
'Add factual manager observations, coaching actions and development goals. Make feedback specific and respectful.',
'Use Development to follow goals and Recognition to acknowledge achievements. Crew can use Growth for their personal development information.'
],['The first implementation does not provide every advanced career-path, numeric manager-rating or reporting feature. Objective scores are guidance based on available records, not automatic promotion or employment decisions.'],('development','Filters, overview measures and coaching workspaces.')),
('Check order completeness before delivery','Authorised counter/crew; managers review','Order Accuracy is a packing check, not the POS and not proof that payment was received.',[
'Crew: open the authorised Order Accuracy feature and choose Scan Receipt.',
'Take/upload a readable image using the available control. Allow camera access only on a trusted device when needed.',
'Review the extracted order ID and every item. Correct recognition mistakes before proceeding.',
'In Verify Items & Packaging, check each item, quantity and required extras against what is physically packed.',
'Add packaging photos where required and submit using the confirmation action shown. Only hand over after the check is complete.',
'Manager: use Order Accuracy filters and Validation Logs to review order details, item validations and evidence.'
],['Receipt recognition can be wrong. Do not trust it without checking the original order. Do not expose customer names, receipts or delivery details in public screenshots.'],('orders','Manager view: date/outlet filters and validation logs.')),
('Read attendance and task reports','Owner / authorised report viewer','Choose the period first. A new workspace can legitimately show no results until daily activity is recorded.',[
'Open Reports. Set both dates, Store and Employee, then choose Run Report.',
'Punctuality Log shows late-arrival and absence incidents; on-time employees may not appear in the incident list.',
'Punctuality Scores summarises the employees for whom scheduled shifts were analysed. Check roster and attendance completeness first.',
'Task Performance shows completion trends and task-ranking breakdowns for the selected period.',
'If the report is empty, broaden the date range and confirm active employees, active outlets, shifts and logs exist.',
'If Report could not be loaded appears, retry once. Report permission/index errors to the platform operator instead of assuming records were deleted.'
],['The default period may start at the current week. Scores use the current report formula and filters; verify individual incidents before taking management action.'],('reports','Date range, store/employee filters and the three report tabs.')),
('Prepare HR letters and documents','Owner / authorised HR manager','Review every generated letter before sharing it. The tool prepares documents; it does not replace employment or legal review.',[
'Open HR & Letters. Review company assets, letterhead details and relevant templates in the configuration area.',
'Select the employee in the operations area and check their name, joining date and other relevant details.',
'Open Letters and choose the required available letter type. Complete any salary or leaving-date prompts carefully.',
'Generate the document and inspect the preview/print output before downloading or printing.',
'Use Documents to upload and organise the permitted employee records.',
'Share only with the intended recipient through the appropriate private channel. Keep employee data off public devices.'
],['Generated joining, experience, relieving, salary or bank-related documents must match verified facts and the applicable company policy. Do not assume an email was sent just because a document was generated.'],None),
('Recognition, login audit and maintenance','Owners / authorised administrators','These modules affect evidence and accountability. Treat deleting records as a separate, deliberate decision.',[
'Emp. of Month: use Cycles to define the period, Scoring for authorised inputs and Results for the calculated breakdown. Check eligibility and evidence.',
'Login Activity: filter/search recent login records by person, store or account type. Refresh if needed.',
'Clear logs permanently removes the login audit history. Export/preserve needed evidence and obtain business approval before clearing.',
'System Maint.: choose the record category and retention period, analyse the affected records and review the cutoff.',
'Download the offered backup before deletion. Confirm its contents and preserve it securely; an export is not necessarily a full database restore backup.',
'Proceed with the confirmation step only if retention policy, reporting needs and record obligations have been checked.'
],['Deleting attendance, task logs or roster history can change future reports and development measures. Maintenance is not an everyday crew task. Never delete records simply to make a dashboard cleaner.'],None),
('Optional modules and tenant boundaries','Owners','Your restaurant workspace is a tenant. It holds your outlets, people and operational records separately from other businesses.',[
'Operate all of your outlets inside the appropriate business workspace. A second outlet is not automatically a second tenant.',
'If Kitchen Recipes is enabled for your workspace, treat it as a separate reference module and follow your organisation’s recipe owner instructions.',
'Platform Administration appears only for a separately authorised platform account. Restaurant owners should not expect tenant creation or subscription controls there.',
'Do not share tenant links, manager sessions or employee codes with another business.',
'If you cannot see an expected outlet or module, ask the owner to review your active membership, assigned outlets and role permissions.',
'For billing or trial continuation, use the subscription process the platform operator provides. Do not assume payments are enabled because a trial is active.'
],['This guide covers restaurant operations. It does not claim that automated billing, facial attendance or computer-vision features are available. Some modules may be disabled or retired by your administrator.'],None),
('Troubleshooting and your daily routine','Everyone','Use this checklist before reporting a problem. Do not reset devices or create duplicate records as the first response.',[
'Cannot sign in: check the correct app URL and login type. Owners/managers use Manager sign in; crew use their assigned code. Do not repeatedly guess credentials.',
'Missing module/data: check active profile, role permissions, outlet assignment and selected dates. An owner seeing a module does not prove crew have access.',
'Missing task/training: confirm assignment, outlet/role eligibility and publication/schedule status. Refresh after saving changes.',
'Video does not play: check connectivity and use a current browser; report the exact message and module name. Managers should test the same assigned version.',
'Morning: confirm attendance, check the roster and review tasks. Manager: start with Today’s Overview and resolve priority actions.',
'Before closing: finish or explain outstanding tasks, review incidents and attendance, complete the outlet closing process and check out.'
],['When reporting an issue, include module, time, device/browser, outlet and exact message. Share screenshots privately and hide personal details. Never send passwords, PINs, tokens or service-account keys.','Guide maintenance: update screenshots when navigation changes. Source edition: local app based on main ac86e49 plus the onboarding draft; real-device installation and live signup delivery require separate acceptance tests.'],None),
]

story.append(PageBreak()); p('Find your next step','NTitle')
p('Read chapters 1-6 when setting up. Managers then use chapters 7-17. Crew can begin with chapters 2, 8, 10, 12 and 14.','NBody')
for i,c in enumerate(chapters,1): p(f'{i:02d}  {c[0]}  |  page {i+2}','NBody')
p('Large screenshot reference plates follow the chapters, starting on page 22.','NCaption')
p('Safety first','NSub'); p('Read-only demo screenshots illustrate the interface. This guide contains no credentials and no real staff records. Follow your permissions, company procedures and local requirements.','NNote')
for i,c in enumerate(chapters,1): chapter(i,*c)

for name,title,look in [
 ('hub','Owner hub','Find the module cards. Your visible cards depend on permissions.'),
 ('stores','Store setup','Look for timezone, stable outlet ID, active status and Save Store.'),
 ('employees','Employee profiles','Look for Staff Directory / Managers, Add New, role and store fields.'),
 ('access','Access matrix','Use the appropriate role column and feature row; save only after review.'),
 ('tasks','Task definitions','Use Tasks, store/frequency filters and + New Task.'),
 ('shifts','Shift roster','Choose an outlet and week. Define shifts before assigning roster cells.'),
 ('attendance','Attendance workspace','Find Dashboard, Report, Leave balance, Settings and Launch Kiosk.'),
 ('training','Training module editor','Choose type, requirements, applicability and publication status.'),
 ('development','Development overview','Filter the team and time period before reading objective measures.'),
 ('orders','Order validation review','Review the dates, outlet filters and saved validation evidence.'),
 ('reports','Report filters','Set both dates and the employee/store filters before Run Report.'),
]:
    story.append(PageBreak()); p('LARGE SCREEN REFERENCE','NCaption'); p(title,'NTitle'); p(look)
    filename=ROOT/f'docs/guide/screens/{name}.jpg'; w,h=ImageReader(str(filename)).getSize(); scale=min(495/w,565/h)
    story.append(Image(str(filename),width=w*scale,height=h*scale))
    p('Actual local app screen with fictional read-only demo data. No live records.','NCaption')

def footer(canvas,doc):
    canvas.saveState(); w,h=doc.pagesize
    canvas.setStrokeColor(colors.HexColor('#ded9ce')); canvas.line(40,38,w-40,38)
    canvas.setFont('Helvetica',8); canvas.setFillColor(colors.HexColor('#64748b'))
    canvas.drawString(40,25,'NEKO PULSE | User guide 1.0 | 5 October 2026')
    canvas.drawRightString(w-40,25,str(doc.page))
    canvas.restoreState()

DEST.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(DEST),pagesize=(595.28,841.89),rightMargin=48,leftMargin=48,topMargin=44,bottomMargin=54,title='Neko Pulse - Illustrated User Guide',author='Neko Pulse',pageCompression=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
out=ROOT/'output/pdf/neko-pulse-user-guide.pdf'; out.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(DEST,out)
print(out)
