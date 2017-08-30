node('node') {
    currentBuild.result = "SUCCESS"

    try {

       stage('Checkout'){
          checkout scm
       }

        stage('Initialize') {
          echo 'Initializing...'
          def node = tool name: 'Node-8.4.0', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'
          env.PATH = "${node}/bin:${env.PATH}"
          env.NODE_ENV = "test"
          sh 'node -v'
          sh 'yarn install'
        }

       stage('Build'){
         env.NODE_ENV = "test"
         sh 'node -v'
         sh 'yarn build'
       }

       stage('Test'){
         env.NODE_ENV = "test"
         sh 'yarn test'

       }

       stage('Link'){
         env.NODE_ENV = "test"
         sh 'yarn link'
       }

       stage('Cleanup'){
         echo 'prune and cleanup'
         sh 'rm node_modules -rf'
         sh 'rm build -rf'
       }

    }
    catch (err) {
        currentBuild.result = "FAILURE"
        throw err
    }

}
