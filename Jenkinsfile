pipeline {
    agent any

    triggers {
      upstream(upstreamProjects: "weplay-common/" + env.BRANCH_NAME.replaceAll("/", "%2F"), threshold: hudson.model.Result.SUCCESS)
    }
    stages  {

        stage('Initialize') {
          steps {
            script {
              def node = tool name: 'Node-8.4.0', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'
              env.PATH = "${node}/bin:${env.PATH}"
            }
            sh 'node -v'
            sh 'yarn install'
          }
        }

       stage('Build'){
         steps {
            sh 'yarn build'
         }
       }

       stage('Test'){
         steps {
            sh 'yarn lint'
            sh 'yarn plato'
         }
       }

       stage('Archive'){
         steps {
            sh 'yarn pack'
            archiveArtifacts '*.tgz'
            publishHTML([allowMissing: false, alwaysLinkToLastBuild: false, keepAll: true, reportDir: 'report/plato', reportFiles: 'index.html', reportName: 'Plato Report', reportTitles: ''])
         }
       }

      stage('Docker arm'){
        agent { label 'arm'  }
        steps {
            sh 'docker build --no-cache -t iromu/weplay-rom-arm:latest . -f Dockerfile_arm'
            sh 'docker push iromu/weplay-rom-arm:latest'
        }
      }


      stage('Docker amd64'){
        agent { label 'docker'  }
        steps {
            sh 'docker build --no-cache -t iromu/weplay-rom:latest . -f Dockerfile'
            sh 'docker push iromu/weplay-rom:latest'
        }
      }


       stage('Cleanup'){
         steps {
            cleanWs()
         }
       }

    }
}
