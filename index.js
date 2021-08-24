const Core = require('@actions/core');
const { Octokit }  = require("@octokit/rest")
const Github = require("@actions/github")


// most @actions toolkit packages have async methods
async function run() {
  try {
    Core.startGroup("🚦 Initializing...")
    const authSecret = Core.getInput('auth-secret')

    Core.info("Auth with GitHub Token...")
    const octokit = new Octokit(
      {
        auth: authSecret,
      }
    )
    Core.info("Done.")
    Core.endGroup()

    Core.startGroup("Importing inputs...")
    const repoSource = Core.getInput('repo-source') || Github.context.repo.repo
    const ownerSource = Core.getInput('owner-source') || Github.context.repo.owner
    const repoDestination = Core.getInput('repo-destination')
    const ownerDestination = Core.getInput('owner-destination')
    const issuesWithLabels = Core.getInput('labels') ? Core.getInput('labels').split(',') : []
    const projectName = Core.getInput('project')
    const columnName = Core.getInput('column')

    Core.endGroup()

    const projectId = await getProjectId(octokit, ownerSource, repoSource, projectName)
    const columnId = await getColumnId(octokit, projectId, columnName)
    const issuesInColumn = await octokit.projects.listCards({
      column_id: columnId
    });

    const issuesInRepo = await getIssues(octokit, ownerSource, repoSource, 'open', issuesWithLabels)
    const issueNumbersInRepo = issuesInRepo.map(i => i.number)

    for (let issueInColumn of issuesInColumn.data) {

      const {content_url} = issueInColumn
      if (content_url.includes('/issues/')) {

        const issueNumber = parseInt(content_url.split('/').pop())
        if (issueNumbersInRepo.includes(issueNumber)) {

          const issue = await octokit.rest.issues.get({
            owner: ownerSource,
            repo: repoSource,
            issue_number: issueNumber,
          });

          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const urls = issue.data.body.match(urlRegex)
          const relatedIssueUrl = urls.find((u) => u.includes(`/${ownerDestination}/${repoDestination}/issues`))
          const targetIssueNumber = parseInt(relatedIssueUrl.split('/').pop())

          await octokit.rest.issues.createComment({
            owner: ownerDestination,
            repo: repoDestination,
            issue_number: targetIssueNumber,
            body:
            "![](https://img.shields.io/badge/-resolved-blueviolet) \n\n " +
            "This issue will be automatically closed. If you encounter any persisting problems related to this issue, please feel free to leave a comment or reopen it. \n\n " +
            "<sub>This comment is automatically powered by Bryntum Support Bot.</sub>",
          });

          await octokit.rest.issues.update({
            owner: ownerSource,
            repo: repoSource,
            issue_number: issueNumber,
            state: 'closed'
          });
          await octokit.rest.issues.update({
            owner: ownerDestination,
            repo: repoDestination,
            issue_number: targetIssueNumber,
            state: 'closed'
          });
        }
      }
    }
  } catch (error) {
    console.log('error', error)
    Core.setFailed(error.message);
  }
}

async function getProjectId(octokit, ownerSource, repoSource, projectName) {
  const projects = await octokit.projects.listForRepo({
    owner: ownerSource,
    repo: repoSource,
  });
  const project = projects.data.find((p) => p.name === projectName)
  return project.id
}

async function getColumnId(octokit, projectId, columnName) {
  const columns = await octokit.projects.listColumns({
    project_id: projectId,
  });
  const column = columns.data.find((p) => p.name === columnName)
  return column.id
}

async function getIssues(octokit, owner, repo, state, labels) {

  Core.startGroup(`📑 Getting all Issues in repository ${owner}/${repo}...`)
  let page = 1
  let issuesPage
  let issuesData = []
  do {
    issuesPage = await octokit.issues.listForRepo({
      owner: owner,
      repo: repo,
      ...(state && {state: state}),
      ...(labels && {labels: labels}),
      page
    });
    issuesData = issuesData.concat(issuesPage.data)
    page++
  } while (issuesPage.data.length)
  Core.info(`${issuesData.length} collected...`)
  return issuesData
}

run();
